## Payment generator (`src/app/api/generate-payment/route.ts`)

POST route handler. No external AI — delegates all calculation to `buildPaymentMessage()` from `src/lib/payment.ts`:
- Validates request body (month 1–12, year 2020–2100, carryover required for template 2), fetches student from DB, then calls `buildPaymentMessage()` with the student data + params
- Returns `{ message }` on success, `{ error }` on validation/not-found failures
- `src/lib/payment.ts` is the single source of truth for fee calculation and message templates — do not inline payment logic in this route or in `tools.ts`

## AI Agent (`src/app/admin/(app)/agent/`, `src/app/api/agent/`, `src/lib/agent/`)

Natural language interface for managing students. Gemini 2.5 Flash drives a function-calling loop that executes against Supabase and Google APIs.

**File structure:**
- **`agent/page.tsx`** — thin server component wrapper; renders `<AgentChat />`
- **`components/agent/AgentChat.tsx`** — client component; see UI section below
- **`api/agent/chat/route.ts`** — stateless POST handler; drives the Gemini loop
- **`api/agent/stop/route.ts`** — tutor-only POST; sets the `stopSignals` flag and aborts the registered `AbortController` for the given `requestId`; called by the frontend stop button
- **`lib/agent/stop-signals.ts`** — module-level singletons: `stopSignals: Map<string, boolean>` (soft-stop flags), `requestAbortControllers: Map<string, AbortController>` (per-request controllers for hard abort), `isAbortError(err)` helper; imported by both chat routes and the LangGraph stream adapter
- **`lib/agent/tools.ts`** — all 19 tool implementations + `errMsg` helper + `ALLOWED_UPDATE_KEYS`
- **`lib/agent/schema.ts`** — thin composer: exports `TOOL_DECLARATIONS` and `SYSTEM_INSTRUCTION` by spreading the three domain arrays and interpolating the three rule strings; rule 14 (parallel calls) lives inline here as it is cross-domain
- **`lib/agent/domains/students.ts`** — `STUDENT_DECLARATIONS` (11 tools: `search_students` … `get_fee_summary`) + `STUDENT_RULES` (rules 1–13); imports `DAYS` from `src/lib/utils`
- **`lib/agent/domains/templates.ts`** — `TEMPLATE_DECLARATIONS` (3 tools: `list_templates`, `get_template`, `generate_payment_message`) + `TEMPLATE_RULES` (rules 15–16); imports `TEMPLATE_META` for the `get_template` enum
- **`lib/agent/domains/timetable.ts`** — `TIMETABLE_DECLARATIONS` (5 tools: `get_timetable_settings` … `download_timetable_image`) + `TIMETABLE_RULES` (rules 17–18)
- **`lib/agent/eval.ts`** — `selfEval()`: post-mutation DB verification

**Tool design:** fine-grained reads, coarse-grained writes. Read tools (`search_students`, `get_student`, `list_students`, `get_schedule`, `get_fee_summary`, `list_templates`, `get_template`, `get_timetable_settings`) are granular so Gemini picks exactly the data shape needed. Write tools (`setup_student_google`, `sync_all_students`) are compound — they bundle steps the user always wants together (Calendar + Drive in one call) to reduce round trips and planning burden on the LLM. Keep total tool count under ~20 to avoid description-space crowding that degrades tool-selection accuracy.

**Tools (all 19):**

| Tool | Required | Optional | Returns |
|---|---|---|---|
| `search_students` | `query` | — | `{ students: [{ id, name, status, class_schedule }] }` |
| `get_student` | `id` | — | `{ student: <all fields> }` |
| `list_students` | — | `status` | `{ students: [{ id, name, status, mode, fee_per_hour, class_schedule }] }` |
| `create_student` | `name`, `mode`, `fee_per_hour` | all other fields | `{ student: { id, name }, suggestGoogleSetup?: true }` |
| `update_student` | `id`, `fields` | — | `{ success: true, googleWarnings?: string[], suggestGoogleSetup?: true }` |
| `delete_student` | `id` | — | `{ success: true, warnings?: string[] }` |
| `setup_student_google` | `student_id` | — | `{ result: string }` or `{ error: string }` |
| `sync_all_students` | — | — | `{ results: [...] }` |
| `manage_portal_access` | `student_id`, `action`, `email` | — | `{ result: string }` |
| `get_schedule` | `day` (Monday–Sunday) | — | `{ day, students: [{ id, name, slots: [{ start, end }] }] }` |
| `get_fee_summary` | — | `month`, `year` | `{ month, year, students: [{ id, name, fee }], total }` |
| `list_templates` | — | — | `{ templates: [{ id, title, description }] }` |
| `get_template` | `id` | — | `{ template: { id, title, description, content } }` |
| `generate_payment_message` | `student_id` | `month`, `year`, `template_type`, `carryover` | `{ message, month, year, monthName }` |
| `get_timetable_settings` | — | — | `{ rules: string, bufferMins: number }` |
| `update_timetable_rules` | `rules` | — | `{ ok: true }` or `{ error: string }` |
| `update_buffer_mins` | `buffer_mins` | — | `{ ok: true }` or `{ error: string }` |
| `generate_slot_availability` | — | `student_availability` | `{ slots: ClassifiedSlot[] }` or `{ error: string }` |
| `download_timetable_image` | — | — | `{ students: ScheduleStudent[] }` or `{ error: string }` |

**Function-calling loop (`api/agent/chat/route.ts`):**
- Current MYT date is prepended to `SYSTEM_INSTRUCTION` at request time via `Intl.DateTimeFormat('en-MY', { timeZone: 'Asia/Kuala_Lumpur', weekday: 'long', ... })` so Gemini can resolve "today"/"tomorrow" before calling `get_schedule`
- Receives full `messages[]` history and a `requestId` (UUID) on every request (stateless — frontend owns history)
- Maps frontend `role: 'agent'` → Gemini `role: 'model'` before sending
- Returns a `text/event-stream` SSE `Response` (not JSON). SSE event types: `{ type: 'step', content }` for tool calls, `{ type: 'chunk', content }` for streamed text tokens, `{ type: 'done' }` on completion, `{ type: 'stopped' }` on user-initiated stop, `{ type: 'error', message }` on failure.
- Runs up to 10 rounds using `generateContentStream` for all rounds. Tool-calling rounds accumulate `FunctionCall[]` from chunks and emit `step` events immediately after each tool fires. The final text-only round (`roundFnCalls.length === 0`) streams `chunk` events token-by-token as Gemini produces them. Guard: text is only emitted while no function calls have appeared in the current round (`roundFnCalls.length === 0` inside the chunk loop).
- **Soft stop (between rounds):** each round starts with `if (req.signal.aborted || (requestId && stopSignals.get(requestId))) break` — stops cleanly between tool rounds, never mid-tool. `req.signal.aborted` covers abnormal client disconnect; `stopSignals` covers the frontend stop button.
- After each round, model content (text + fn-call parts) is reconstructed from the accumulated chunks and pushed to `contents` for conversation history.
- Within each tool-calling round, all function calls are executed in parallel via `Promise.all` (Gemini can return multiple calls per round); steps are emitted in call order before parallel execution so display order is stable. After parallel rounds, a timing step is emitted: `⏱ parallel ×N — tool1 Xms, tool2 Yms (total Zms)`. Single-tool rounds emit no timing step. `timings` is pre-allocated as `new Array(namedCalls.length)` and written by index (not pushed) to preserve call order regardless of completion order.
- `chunk.text` is not used on streaming chunks — text is extracted manually from `chunk.candidates?.[0]?.content?.parts` filtering only text parts, to avoid SDK warnings when function-call parts are present in the same chunk.
- `gotReply` boolean tracks whether a text round completed; if false after the loop (and not stopped), emits a fallback `chunk` event.
- `lastMutationTool` tracks the final mutation in the loop for `selfEval` (create captures `createdId` from the tool result; update/delete/setup use `MUTATION_TOOLS` set)
- `MUTATION_TOOLS = new Set(['update_student', 'delete_student', 'setup_student_google', 'update_timetable_rules', 'update_buffer_mins'])` — named constant at module level; used for both mutation tracking and selfEval dispatch
- After tool results are processed, `download_timetable_image` emits `{ type: 'download_schedule', students }` SSE event and `generate_slot_availability` emits `{ type: 'slots_ready', slots }` — both trigger inline download buttons in the chat UI
- `selfEval` always runs after the loop if a mutation occurred — even when stopped — so the user sees write-op confirmation before the connection closes. Result emitted as a `step` event, then `{ type: 'stopped' }` or `{ type: 'done' }` depending on whether a stop was requested.

**Self-evaluation (`lib/agent/eval.ts`):**
- `selfEval(toolName, args, supabase, createdId?)` — runs after the loop completes if any mutation occurred
- `create_student` / `update_student`: SELECT `id` WHERE `id = X` → `✓ verified in DB` or `⚠ could not verify`
- `delete_student`: SELECT `id` WHERE `id = X` → `✓ verified deleted` or `_⚠ student still exists in DB_`
- `setup_student_google`: SELECT `google_meet_link, google_drive_link` → reports which links are set
- `update_timetable_rules`: reads back `timetable_rules` from `settings` and compares to `args.rules` → `✓ rules verified in DB` or `⚠ could not verify rules`
- `update_buffer_mins`: reads back `timetable_buffer_mins` and compares parsed integer → `✓ buffer set to Xm` or `⚠ could not verify buffer`
- Result is appended to `steps[]` (not `reply`) so it appears in the tool-steps section

**Tool implementation notes (`lib/agent/tools.ts`):**
- `ALLOWED_UPDATE_KEYS` Set — allowlist of writable columns for `update_student`; prevents prompt injection from touching any column not in the set
- `update_student` auto-syncs Calendar + Drive when `class_schedule` is in the updated fields: if `calendar_event_ids` + `google_meet_link` are set, calls `updateWeeklyClassEvents` (nuke-and-repave) and `updateStudentMeetDoc` in parallel via `Promise.allSettled`; if a new Meet link is generated (primary was deleted), also saves it to DB and re-updates the Drive doc; Google failures are non-fatal (returned as `googleWarnings`); if Google is not set up, returns `suggestGoogleSetup: true` instead
- `create_student` returns `suggestGoogleSetup: true` when a `class_schedule` was provided — the system instruction rule 11 tells Gemini to ask the user if they want Google setup
- `setup_student_google` fetches the student's `mode` from the DB and passes it to `createStudentDriveFolder` — so Other Syllabus students get a Meet-doc-only folder, Python Syllabus students get the full 4-subfolder structure
- `delete_student` attempts Google cleanup (Drive trash + Calendar delete) before the DB delete; Google failure is non-fatal
- `errMsg(err, fallback)` — use this everywhere instead of inlining error strings
- `getFeeSummary` uses `getWeekdayDates` (from `src/lib/utils.ts`) for exact session counting; tracks raw fees in a parallel array to avoid per-student rounding accumulation before summing the total
- `listTemplates` is a pure synchronous function — no DB call. All metadata (id, title, description) lives in the in-memory `TEMPLATE_META` from `src/lib/templates.ts`; only `get_template` hits the DB to fetch `content`
- `getTemplate` uses `.maybeSingle()` and returns `{ id, title, description, content }` via `templateMeta(id)` helper from `src/lib/templates.ts`
- `generatePaymentMessage` defaults to next calendar month (MYT) when `month`/`year` are omitted; fetches student from DB, then delegates all calculation to `buildPaymentMessage()` from `src/lib/payment.ts`; returns `{ message, month, year, monthName }`
- `getTimetableSettings`: fetches `timetable_rules` and `timetable_buffer_mins` from `settings` in parallel; returns `{ rules, bufferMins }` (bufferMins defaults to 15 if unset)
- `updateTimetableRules` / `updateBufferMins`: upsert into `settings` table with `onConflict: 'key'`; `updateBufferMins` validates the value is 0–60 before writing
- `generateSlotAvailability`: fetches rules, buffer, and all active students' `class_schedule` in a single `Promise.all`; calls `runSlotGeneration` from `src/lib/timetable-slots.ts`; returns `{ slots: ClassifiedSlot[] }`. Returns `{ error }` if no rules are configured. The route emits a `slots_ready` SSE event with the slots so the chat UI can show a download button.
- `downloadTimetableImage`: fetches active students' `name` and `class_schedule` ordered by name; returns `{ students }` which the route forwards as a `download_schedule` SSE event; the frontend renders the PNG client-side using `drawScheduleToCtx` from `src/lib/timetable-canvas.ts` for pixel-identical output to the timetable tab

**Shared timetable libs:**
- **`src/lib/timetable-slots.ts`** — `BookedSlot`, `SlotState`, `ClassifiedSlot` types; `computeBufferSlots`, `buildBookedCellSet`, `buildSlotPrompt`, `runSlotGeneration` — used by both `api/timetable/generate-slots/route.ts` and the agent's `generateSlotAvailability` tool
- **`src/lib/timetable-canvas.ts`** — shared drawing constants and functions (`NAVY`, `SCALE`, `PNG_*` constants, `cellKey`, `fmt12`, `downloadCanvas`, `computeScheduleWindow`, `scheduleCanvasHeight`, `drawSlotsToCtx`, `drawScheduleToCtx`) — used by `TimetableSection.tsx`, `AgentChat.tsx`, and the server PNG routes. `type AnyCtx = any` bridges browser Canvas2D and `@napi-rs/canvas` context types.

**System instruction rules summary (domain files + `lib/agent/schema.ts`):**
1. Reuse UUID from conversation history — only call `search_students` if UUID not already known
2. `delete_student` requires explicit "yes" in conversation; must warn about Calendar/Drive removal first
3. Ask for missing required fields (`mode`, `fee_per_hour`) before calling `create_student`
4. Multiple search matches → list and ask which student
5. No search results for update/delete → say so, offer to create instead
6. After create/update → append one `[student_id:NAME:UUID]` token per affected student at the end of the reply (UI renders a "View NAME →" link per token). Example for two students: `[student_id:Lynn:uuid-1] [student_id:Ang:uuid-2]`
7. Formatting rules: tables for lists, bold labels for single records, skip null/empty fields, render Meet/Drive as markdown links, blockquote for notes/homework, list_students for roster queries
8. `sync_all_students` requires explicit confirmation before calling
9. Delete confirmation must mention Google Calendar/Drive removal
10. After `setup_student_google` → also append `[student_id:NAME:UUID]`
11. If tool result has `suggestGoogleSetup: true` → ask user if they want Google setup; only call `setup_student_google` on yes
12. `get_schedule`: resolve "today"/"tomorrow" using injected date; format as Name | Time table (12-hour); say "No classes on [day]" if empty
13. `get_fee_summary`: use for any revenue/fee/income query (all students or a specific student); omit month/year if not specified; format as Name | Fee (RM) table with bold Total row; for single-student query, find the student in the returned list and report only their fee
14. When the user's request involves multiple independent operations, call all relevant tools in a single round (e.g. search two students at once, update two students at once). Only serialise when one call's output is required as input for the next.
15. Templates: call `get_template` directly when the template is clear (e.g. "first approach", "payment"); call `list_templates` first only when ambiguous. Display template as bold title on its own line, then content in a fenced code block (no language tag).
16. `generate_payment_message`: use when the user asks to generate a payment message/reminder for a student. Omit month/year if not specified (defaults to next month). Ask about carryover only if the user mentions it — otherwise default to `template_type 1`. Display result as bold header (e.g. "**Payment reminder — June 2026**") then message in a fenced code block.
17. Timetable settings: use `get_timetable_settings` to read current rules and buffer before updating. When the user asks to update rules, show them the proposed new rules and confirm before calling `update_timetable_rules`. For `update_buffer_mins`, validate the value is 0–60 before calling.
18. After calling `generate_slot_availability` or `download_timetable_image`, tell the user a download button has appeared in the chat. Do NOT describe slot counts or classification details unless the user asks — keep the reply brief (one sentence).

**`[student_id:NAME:UUID]` token protocol:**
- Gemini appends one `[student_id:NAME:UUID]` token per affected student at the end of replies after create/update/setup
- `parseAgentReply(content)` in `AgentChat.tsx` extracts all tokens via regex, strips them from the display text, deduplicates by `id`, and returns `{ text, students: [{ name, id }] }` (agent sometimes emits the same token twice; dedup prevents React duplicate key warnings)
- Legacy `[student_id:UUID]` tokens (no name, stored in localStorage before the format change) are matched by a fallback branch that produces `{ name: 'student', id }` so old messages still render a link
- One `"View NAME →"` `<Link>` is rendered per entry in `students[]`, displayed side-by-side bottom-right of the agent bubble

**AgentChat UI (`components/agent/AgentChat.tsx`):**
- `messages` state lazy-initialised from `localStorage` (key: `agent_chat_messages`); persisted on every change via `useEffect`. A `hydrated` flag (set `true` after the load effect fires) gates both save effects — prevents the save effect from running with `messages = []` before the load effect's `setMessages(stored)` state update commits (React effect ordering race condition that erased history on navigation back to the page; also guards against React StrictMode double-invoke in dev)
- Stored messages include `id` (UUID), `role` (`'user'` | `'agent'`), `content`, `isError?` (boolean — set when any error path fires; `undefined` on old messages so no button appears), `isCancelled?` (boolean — set when user stops the request; persists in localStorage so the "Cancelled" label survives a page refresh), `steps[]`, and `timestamp` (ISO string, optional — absent on messages stored before this field was added)
- `loadStoredMessages` migrates old stored messages without `id` by generating UUIDs on load; messages without `timestamp` simply show no timestamp (no migration needed)
- **SSE streaming:** `send(retryMsgId?: string)` — when called without arguments (normal send), creates a new user message + blank pending agent message and appends both to history. When called with a `retryMsgId`, resets the existing error bubble in-place (`content: ''`, `steps: []`, `isError: false`, `isCancelled: false`) and builds `apiMessages` from the history slice up to (not including) that bubble — no user message is added. `toApiMsg` helper maps `ChatMessage → { role, content }` (shared by both paths). `step` events append to the pending message's `steps[]`; `chunk` events append to `content`; `stopped` event and `AbortError` catch both call `markCancelled()` which sets `isCancelled: true` on the pending message; all three error paths (SSE error event, non-abort `catch`, `finally !received && !isCancelled`) set `isError: true`. A `received` flag gates the fallback message. Each `send()` call assigns a fresh `requestId` (UUID) sent in the fetch body and stored in `requestIdRef`; `pendingIdRef` tracks the current pending message ID for access from `stop()` outside the closure; `receivedChunkRef` is set `true` on the first `chunk` event.
- The placeholder bubble shows three animated bouncing dots (custom `dot-jump` keyframe in `globals.css`, staggered 0/200/400 ms via inline `animationDelay`) while `content === ''` and `!msg.isCancelled && !msg.isError`; cancelled or errored empty bubbles show a static `⋯` instead. Transitions directly to steps + streaming text as events arrive. There is no separate loading bubble.
- Reply rendered via `<ReactMarkdown remarkPlugins={[remarkGfm]}>` — supports GFM tables, bold, blockquotes, links
- Custom `a` renderer: `mailto:` links render as `<span>` (prevents remark-gfm from auto-linking email addresses as clickable mailto links)
- Tool steps rendered above reply in a smaller muted section; UUID regex applied at render time (client-side cosmetic concern, not server-side)
- Input auto-focuses on mount and after each agent response via `useEffect([loading])`; disabled (and not focused) while the agent is executing
- **Inline download buttons:** `ChatMessage` carries optional `scheduleStudents` and `slotData` fields populated by `download_schedule` and `slots_ready` SSE events respectively. When present, one or both download buttons render below the reply text. `downloadSchedulePng` and `downloadSlotsPng` use `drawScheduleToCtx` / `drawSlotsToCtx` from `src/lib/timetable-canvas.ts` for pixel-identical output to the timetable tab PNG exports. `downloadCanvas` (also from the shared lib) handles the `<a>` click trigger.
- **Timestamps + retry row:** timestamp and retry button share one `flex justify-between` row below each bubble. Timestamp is always on the left (or right for user messages via `justify-between` with a single child). `formatMessageTime(iso, now)` formats in MYT: time only (`"2:34 PM"`) if today, `"May 20, 2:34 PM"` if earlier this year, `"May 20 2025, 2:34 PM"` if a different year. Options objects (`MYT_DATE_KEY_OPTS`, `MYT_TIME_OPTS`, `MYT_DAY_MONTH_OPTS`) are module-level constants; `renderNow = new Date()` is computed once per render and passed in to avoid N allocations during SSE chunk re-renders.
- **Stop button:** the send button transforms into a ■ Stop button while `loading` is true. `stop()` is split on `receivedChunkRef`: if chunks have already arrived (text round) → `abortControllerRef.current?.abort()` (A1: close the SSE connection immediately; partial text is fine since all write ops are already done); if no chunks yet (tool round) → POST to `/api/agent/stop` with `{ requestId }` (soft stop: server finishes the current tool round, emits selfEval, then emits `{ type: 'stopped' }`). In both paths, `stop()` immediately calls `setMessages` to set `isCancelled: true` on the pending message via `pendingIdRef` (optimistic update — instant visual feedback regardless of server timing). The pending bubble shows `Cancelled` in the timestamp row footer when `isCancelled` is true.
- **Retry button:** agent messages with `isError: true` show a `↻ Try again` text button on the right of the timestamp row. `retry(msgId)` walks backwards through `messages` from the error bubble to find the preceding user message, then calls `send(msgId)` to replay in-place. Button is disabled while `loading` is true. `isError` persists in localStorage so the button survives a page refresh.
- **Voice input:** `speechSupported` is a `useState(false)` set to `true` in a `useEffect` after mount (checks `SpeechRecognition` / `webkitSpeechRecognition` on `window`; works in Chrome, Edge, Safari — not Firefox). Using `useEffect` rather than `useMemo` is required to avoid SSR/client hydration mismatch — the server renders `false` and the client corrects it after hydration. Mic button is hidden when unsupported. `toggleVoice()` starts/stops a `SpeechRecognition` instance stored in `recognitionRef`. `cleanupRecognition(focus?)` is a shared helper called by both `onend` and `onerror` to deduplicate state reset. An unmount-cleanup `useEffect` calls `recognitionRef.current?.stop()` to release the mic if the component unmounts while listening.
- **LangGraph toggle:** `useLangGraph` lazy-initialised from `localStorage` (`agent_use_lg`); persisted on every change. When on, `send()` routes to `/api/agent/lg/chat` instead of `/api/agent/chat`. Both endpoints emit the same SSE event format (including `stopped`) so the chat UI handles both identically.

---

## LangGraph multi-agent system (`src/lib/agent/lg/`, `src/app/api/agent/lg/`)

Alternative agent backend toggled via the **LangGraph** switch in the chat header. Uses `@langchain/langgraph` with a supervisor+subagent architecture instead of the classic single-agent Gemini loop. Both backends share the same 19 tool implementations in `src/lib/agent/tools.ts`; the LangGraph layer wraps them in Zod schemas via `tool-factories.ts`.

**LangSmith tracing:** LangGraph runs are traced automatically when `LANGCHAIN_TRACING=true` and `LANGSMITH_API_KEY` are set in the environment. Traces (tool calls, LLM inputs/outputs, latency) appear in the LangSmith web UI under `LANGSMITH_PROJECT` (`tuition-agent` by default). Classic-mode runs are not traced. Required env vars: `LANGCHAIN_TRACING`, `LANGSMITH_ENDPOINT`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT` — all documented in `.env.example`.

**File structure:**
- **`lib/agent/lg/model.ts`** — `getGeminiChatModel()`: returns a fresh `ChatGoogle` instance per call (`gemini-2.5-flash`, `temperature: 0`, `thinkingBudget: 0`); parallel subagents must not share a model instance; `thinkingBudget: 0` disables Gemini 2.5 Flash's thinking pass, which otherwise exhausts its token budget on large tool schemas (11 tools) and returns an empty response
- **`lib/agent/lg/handoff.ts`** — `HandoffTask` type (`{ agentName, task }`); `createDispatchTool()`: creates the `dispatch` tool — the LLM uses the schema to declare which agents to call and what task to give each (one `{ agentName, task }` entry per agent); the implementation is a dummy (never invoked — `supervisorNode` intercepts the call and emits `Send` commands directly before any ToolNode runs); `normalizeAgentName()`: slugifies agent names
- **`lib/agent/lg/progressive.ts`** — `buildSubagent()`: builds the standard ReAct subagent graph (see below)
- **`lib/agent/lg/custom-supervisor.ts`** — `buildCustomSupervisor()`: builds the supervisor+subagent multi-graph (see below)
- **`lib/agent/lg/supervisor.ts`** — `makeSupervisor(supabase, dateString)`: wires up the three subagents under the supervisor and compiles; `buildSupervisorPrompt(dateString)`: supervisor system prompt with routing rules
- **`lib/agent/lg/student-agent.ts`** — `makeStudentAgent(supabase)`: student records subagent with `makeStudentPostHook`
- **`lib/agent/lg/template-agent.ts`** — `makeTemplateAgent(supabase)`: templates/payment-messages subagent
- **`lib/agent/lg/timetable-agent.ts`** — `makeTimetableAgent(supabase)`: timetable settings/slots subagent with `makeTimetablePostHook`
- **`lib/agent/lg/tool-factories.ts`** — `makeStudentTools()`, `makeTemplateTools()`, `makeTimetableTools()`: wrap the 19 shared tool implementations in Zod schemas for LangGraph `tool()` wrappers. `generate_slot_availability` and `download_timetable_image` also call `config.writer` to emit custom SSE events.
- **`lib/agent/lg/post-hooks.ts`** — `makeStudentPostHook()`, `makeTimetablePostHook()`: post-tool-execution hooks that call `selfEval` after mutations and emit the verdict as a `SystemMessage` (name: `'self_eval'`) in state — visible to the stream adapter but invisible to the LLM (`@langchain/google` silently strips `SystemMessage` from Gemini context); `findLastMutationCall` uses `AIMessage.isInstance()` to match both `AIMessage` and `AIMessageChunk` (the actual runtime type returned by `model.invoke()`)
- **`lib/agent/lg/stream-adapter.ts`** — `pipeLangGraphStream(stream, emit, signal?, requestId?)`: translates LangGraph's multi-mode event stream into the same SSE event types as the classic agent (`chunk`, `step`, `done`, `stopped`, `error`, `download_schedule`, `slots_ready`); uses `AIMessage.isInstance()` throughout (handles both `AIMessage` and `AIMessageChunk`); checks `stopSignals` after each event as a belt-and-suspenders fallback if LangGraph doesn't honour the AbortSignal fast enough
- **`api/agent/lg/chat/route.ts`** — stateless POST handler; creates a per-request `AbortController` that fires on either client disconnect (`req.signal`) or the stop endpoint (registered in `requestAbortControllers`); calls `makeSupervisor`, streams via `pipeLangGraphStream`; emits `{ type: 'stopped' }` in the `finally` block if a soft-stop was requested and the client is still connected

**Subagent pattern (`progressive.ts`):**

Each subagent is a standard ReAct graph:

```
START → agent ──(tool_calls?)──► tools → [post_hook] → agent
              └──(no calls)───────────────────────────► END
```

- **`agent`**: the LLM sees all domain tools in every turn. It can return multiple tool calls in one response — LangGraph's `ToolNode` executes them in parallel, enabling same-domain batching (e.g. "get Ang AND Zng Yi" → one agent, two parallel tool calls per round).
- **`tools`**: standard LangGraph `ToolNode` — executes all tool calls from the latest AIMessage in parallel, appends results as `ToolMessage`s.
- **`post_hook`** (optional): runs `selfEval` after mutations; emits a `SystemMessage` (name: `'self_eval'`) with the verdict; loops back to `agent`.

`buildSubagent({ name, description?, llm, tools, prompt?, postToolHook? })`: builds and compiles the graph. All domain tools are bound to the LLM at build time. Config is threaded through `agentNode` so LangGraph streaming callbacks propagate correctly through subagent LLM calls.

**Custom supervisor (`custom-supervisor.ts`):**

Replaces `@langchain/langgraph-supervisor` to fix two issues: (1) the official package echoes the handoff ToolMessage content ("Successfully transferred back to supervisor") instead of the subagent's actual reply; (2) `createReactAgent` always makes two LLM calls per supervisor turn (LLM → tool → LLM again to "check if done") — the second call is wasted for a routing supervisor that makes exactly one decision per turn.

**Single-turn `supervisorNode`:** Custom async node function that calls the LLM once per turn, inspects the result, and returns immediately — no React loop. If the response contains a `dispatch` tool call, it creates a synthetic ToolMessage (confirming the dispatch) and returns `Command({ update: { messages }, goto: [Send(agent1, task1), Send(agent2, task2)] })` for direct parallel fan-out. If not, it returns `{ messages: [response] }` which follows the static `addEdge(supervisorName, END)` for a direct reply.

**Fan-in reply format:** `createHandoffBackMessages(agentName, supervisorName, replyText)` synthesises a `transfer_back_to_supervisor` AIMessage (with a matching `tool_calls` entry) + ToolMessage where `ToolMessage.content = replyText`. The pair satisfies Gemini's requirement that every ToolMessage is preceded by a matching functionCall in the AIMessage. The reply goes in the ToolMessage deliberately — Gemini tends to echo/paraphrase the last ToolMessage in its response, so this ensures it echoes the correct subagent answer rather than a generic stub.

`makeCallAgent(agent, supervisorName)`: wraps each subagent invocation, scans backward for the last AI reply using `AIMessage.isInstance()` (handles both `AIMessage` and `AIMessageChunk` returned by `model.invoke()`), and appends the handoff-back messages. Returns `{ messages }` only (not `{ ...output, messages }`) so subagent-internal state fields don't bleed into outer graph state.

**State schema:** plain `createReactAgentAnnotation()` — no `pendingHandoffs` extension; `supervisorNode` emits `Send` commands directly from the dispatch call result with no intermediate accumulation step.

The `buildCustomSupervisor` graph structure:
```
START → supervisor ──(dispatch → Command({ goto: [Send(a1), Send(a2)] }))──► subagents (parallel)
                   └──(direct reply → { messages: [response] })────────────► END

subagent_node × N ──(each, via addEdge)──► supervisor (fan-in after all complete)
```
`addNode(supervisorName, supervisorNode, { ends: agentNamesList })` declares the possible `Send` targets so LangGraph validates routing. `addEdge(supervisorName, END)` is the default path for direct replies; the `Command` return value overrides it for dispatch. Each subagent node is wrapped in `makeCallAgent` and marked `{ subgraphs: [agent] }` so LangGraph propagates the subagent's event stream with namespace prefixes.

**Stream adapter (`stream-adapter.ts`):**

LangGraph streams events as `[namespace, mode, data]` tuples (or `[mode, data]` at top level). Three modes are consumed:

- **`messages`**: streaming text chunks. Only emits `chunk` events from the supervisor namespace (`isFromSupervisor`) and only when not inside a subagent namespace (`isFromAnySubagent`). Skips chunks containing tool calls. Fallback: if no text was streamed, emits `lastSupervisorFinalText` (captured from the `updates` path) as a single chunk.
- **`updates`**: completed node outputs. `emitToolStepsFromMessages` walks each node's output messages and emits `step` events for real tool calls (filtering out `dispatch` and `transfer_*` routing messages). Also emits `step` for `self_eval` SystemMessages from post-hooks.
- **`custom`**: emitted by `generate_slot_availability` and `download_timetable_image` tool wrappers via `config.writer`; forwarded as `slots_ready` / `download_schedule` SSE events.

After each event, a belt-and-suspenders check reads `stopSignals.get(requestId)` — if set, the adapter emits `{ type: 'stopped' }` and returns immediately. This catches the case where LangGraph ignores the AbortSignal (AbortSignal is cooperative — only checked at node boundaries, and Supabase tool calls don't thread the signal). The primary stop path is the `AbortController.abort()` called by the stop endpoint; the per-event check is the fallback.

`isFromSupervisor`: returns `true` for empty namespace `[]` (where supervisor events land since it is a plain node in the outer StateGraph, not a compiled subgraph) and for namespaces starting with `'supervisor:'` (kept for forward-compat). `isFromAnySubagent`: returns `true` for any non-empty namespace that doesn't start with `'supervisor:'` — automatically covers all current and future subagents without hardcoding names.

**Stateless design:** no checkpointer is passed to `.compile()` and no `thread_id` is passed in the stream config. The frontend sends the full `messages[]` history on every request, same as the classic agent. The graph's internal state (accumulated messages) lives only for the duration of one HTTP request.

**Self-evaluation in LangGraph:** `post-hooks.ts` mirrors the classic `selfEval` pattern. `findLastMutationCall` scans backward from the end of state messages, but only as far back as the most recent `self_eval` SystemMessage — this prevents re-running verification on prior mutations when a subagent makes additional read-only calls in the same invocation.

**Supervisor prompt routing rules (key additions vs. classic agent):**
- Answer greetings / meta-questions / capability questions directly without routing
- Payment messages always require a student UUID: dispatch to `student_agent` first if only a name is known, then dispatch to `template_agent` with the UUID in the task
- Relay subagent replies verbatim — never output "Successfully transferred back to supervisor"
- All parallel tasks (same-domain or cross-domain) go into ONE `dispatch` call with multiple entries — the `dispatch` tool is the single routing mechanism
- Same agent, multiple entities → ONE combined entry (subagent batches tool calls internally). Different agents → one entry each (parallel via `Send` fan-out).
- **Never expand or guess student names** — copy the exact name or partial name the user typed; `search_students` does partial matching so "Ang" is a valid task input
