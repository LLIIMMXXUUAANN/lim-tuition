## Payment generator (`src/app/api/generate-payment/route.ts`)

POST route handler. No external AI — pure JS date arithmetic:
- Groups `class_schedule` slots by day via `groupSlotsByDay` (from `src/lib/utils.ts`), finds all occurrences of each weekday in the given month
- Fee = `fee_per_hour × duration_hours × session_count` per day, summed across all days
- Template 2 (carryover): deducts `carryover × avg_fee_per_session` from the total (tutor owes student those sessions)
- `formatFee`, `ordinal`, `oxfordList` are shared utilities from `src/lib/utils.ts` — do not redefine them locally

## AI Agent (`src/app/admin/(app)/agent/`, `src/app/api/agent/`, `src/lib/agent/`)

Natural language interface for managing students. Gemini 2.5 Flash drives a function-calling loop that executes against Supabase and Google APIs.

**File structure:**
- **`agent/page.tsx`** — thin server component wrapper; renders `<AgentChat />`
- **`components/agent/AgentChat.tsx`** — client component; see UI section below
- **`api/agent/chat/route.ts`** — stateless POST handler; drives the Gemini loop
- **`lib/agent/tools.ts`** — all 19 tool implementations + `errMsg` helper + `ALLOWED_UPDATE_KEYS`
- **`lib/agent/schema.ts`** — `TOOL_DECLARATIONS` (Gemini function schemas) + `SYSTEM_INSTRUCTION`
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
- Receives full `messages[]` history on every request (stateless — frontend owns history)
- Maps frontend `role: 'agent'` → Gemini `role: 'model'` before sending
- Returns a `text/event-stream` SSE `Response` (not JSON). SSE event types: `{ type: 'step', content }` for tool calls, `{ type: 'chunk', content }` for streamed text tokens, `{ type: 'done' }` on completion, `{ type: 'error', message }` on failure.
- Runs up to 10 rounds using `generateContentStream` for all rounds. Tool-calling rounds accumulate `FunctionCall[]` from chunks and emit `step` events immediately after each tool fires. The final text-only round (`roundFnCalls.length === 0`) streams `chunk` events token-by-token as Gemini produces them. Guard: text is only emitted while no function calls have appeared in the current round (`roundFnCalls.length === 0` inside the chunk loop).
- After each round, model content (text + fn-call parts) is reconstructed from the accumulated chunks and pushed to `contents` for conversation history.
- Within each tool-calling round, all function calls are executed in parallel via `Promise.all` (Gemini can return multiple calls per round); steps are emitted in call order before parallel execution so display order is stable. After parallel rounds, a timing step is emitted: `⏱ parallel ×N — tool1 Xms, tool2 Yms (total Zms)`. Single-tool rounds emit no timing step. `timings` is pre-allocated as `new Array(namedCalls.length)` and written by index (not pushed) to preserve call order regardless of completion order.
- `chunk.text` is not used on streaming chunks — text is extracted manually from `chunk.candidates?.[0]?.content?.parts` filtering only text parts, to avoid SDK warnings when function-call parts are present in the same chunk.
- `gotReply` boolean tracks whether a text round completed; if false after the loop, emits a fallback `chunk` event.
- `lastMutationTool` tracks the final mutation in the loop for `selfEval` (create captures `createdId` from the tool result; update/delete/setup use `MUTATION_TOOLS` set)
- `MUTATION_TOOLS = new Set(['update_student', 'delete_student', 'setup_student_google', 'update_timetable_rules', 'update_buffer_mins'])` — named constant at module level; used for both mutation tracking and selfEval dispatch
- After tool results are processed, `download_timetable_image` emits `{ type: 'download_schedule', students }` SSE event and `generate_slot_availability` emits `{ type: 'slots_ready', slots }` — both trigger inline download buttons in the chat UI
- `selfEval` result is emitted as a final `step` event before `done`

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
- `update_student` auto-syncs Calendar + Drive when `class_schedule` is in the updated fields: if `calendar_event_ids` + `google_meet_link` are set, calls `updateWeeklyClassEvents` and `updateStudentMeetDoc` in parallel via `Promise.allSettled`; Google failures are non-fatal (returned as `googleWarnings`); if Google is not set up, returns `suggestGoogleSetup: true` instead
- `create_student` returns `suggestGoogleSetup: true` when a `class_schedule` was provided — the system instruction rule 11 tells Gemini to ask the user if they want Google setup
- `setup_student_google` fetches the student's `mode` from the DB and passes it to `createStudentDriveFolder` — so Other Syllabus students get a Meet-doc-only folder, Python Syllabus students get the full 4-subfolder structure
- `delete_student` attempts Google cleanup (Drive trash + Calendar delete) before the DB delete; Google failure is non-fatal
- `errMsg(err, fallback)` — use this everywhere instead of inlining error strings
- `getFeeSummary` uses `getWeekdayDates` (from `src/lib/utils.ts`) for exact session counting; tracks raw fees in a parallel array to avoid per-student rounding accumulation before summing the total
- `listTemplates` is a pure synchronous function — no DB call. All metadata (id, title, description) lives in the in-memory `TEMPLATE_META` from `src/lib/templates.ts`; only `get_template` hits the DB to fetch `content`
- `getTemplate` uses `.maybeSingle()` and returns `{ id, title, description, content }` via `templateMeta(id)` helper from `src/lib/templates.ts`
- `generatePaymentMessage` defaults to next calendar month (MYT) when `month`/`year` are omitted; uses `groupSlotsByDay`, `formatFee`, `ordinal`, `oxfordList` from `src/lib/utils.ts`; `template_type 2` deducts `carryover × avg_fee_per_session`; returns `{ message, month, year, monthName }`
- `getTimetableSettings`: fetches `timetable_rules` and `timetable_buffer_mins` from `settings` in parallel; returns `{ rules, bufferMins }` (bufferMins defaults to 15 if unset)
- `updateTimetableRules` / `updateBufferMins`: upsert into `settings` table with `onConflict: 'key'`; `updateBufferMins` validates the value is 0–60 before writing
- `generateSlotAvailability`: fetches rules, buffer, and all active students' `class_schedule` in a single `Promise.all`; calls `runSlotGeneration` from `src/lib/timetable-slots.ts`; returns `{ slots: ClassifiedSlot[] }`. Returns `{ error }` if no rules are configured. The route emits a `slots_ready` SSE event with the slots so the chat UI can show a download button.
- `downloadTimetableImage`: fetches active students' `name` and `class_schedule` ordered by name; returns `{ students }` which the route forwards as a `download_schedule` SSE event; the frontend renders the PNG client-side using `drawScheduleToCtx` from `src/lib/timetable-canvas.ts` for pixel-identical output to the timetable tab

**Shared timetable libs:**
- **`src/lib/timetable-slots.ts`** — `BookedSlot`, `SlotState`, `ClassifiedSlot` types; `computeBufferSlots`, `buildBookedCellSet`, `buildSlotPrompt`, `runSlotGeneration` — used by both `api/timetable/generate-slots/route.ts` and the agent's `generateSlotAvailability` tool
- **`src/lib/timetable-canvas.ts`** — shared drawing constants and functions (`NAVY`, `SCALE`, `PNG_*` constants, `cellKey`, `fmt12`, `downloadCanvas`, `computeScheduleWindow`, `scheduleCanvasHeight`, `drawSlotsToCtx`, `drawScheduleToCtx`) — used by `TimetableSection.tsx`, `AgentChat.tsx`, and the server PNG routes. `type AnyCtx = any` bridges browser Canvas2D and `@napi-rs/canvas` context types.

**System instruction rules summary (`lib/agent/schema.ts`):**
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
- `parseAgentReply(content)` in `AgentChat.tsx` extracts all tokens via regex, strips them from the display text, and returns `{ text, students: [{ name, id }] }`
- Legacy `[student_id:UUID]` tokens (no name, stored in localStorage before the format change) are matched by a fallback branch that produces `{ name: 'student', id }` so old messages still render a link
- One `"View NAME →"` `<Link>` is rendered per entry in `students[]`, displayed side-by-side bottom-right of the agent bubble

**AgentChat UI (`components/agent/AgentChat.tsx`):**
- `messages` state lazy-initialised from `localStorage` (key: `agent_chat_messages`); persisted on every change via `useEffect`
- Stored messages include `id` (UUID), `role` (`'user'` | `'agent'`), `content`, and `steps[]`
- `loadStoredMessages` migrates old stored messages without `id` by generating UUIDs on load
- **SSE streaming:** on send, a placeholder agent message (`content: ''`, `steps: []`) is added immediately. `send()` reads the SSE response body via `ReadableStream` reader + `TextDecoder` with a line-buffer. `step` events append to the placeholder's `steps[]`; `chunk` events append to `content` (text builds up progressively); `error` events set `content` to the error string. A `received` flag is set on first `chunk` or `error` event; the `finally` block only sets a fallback message if `!received` (avoids a no-op map on every successful request).
- The placeholder bubble shows `⋯` while `content === ''`; it transitions directly to steps + streaming text as events arrive. There is no separate loading bubble.
- Reply rendered via `<ReactMarkdown remarkPlugins={[remarkGfm]}>` — supports GFM tables, bold, blockquotes, links
- Custom `a` renderer: `mailto:` links render as `<span>` (prevents remark-gfm from auto-linking email addresses as clickable mailto links)
- Tool steps rendered above reply in a smaller muted section; UUID regex applied at render time (client-side cosmetic concern, not server-side)
- Input auto-focuses on mount and after each agent response via `useEffect([loading])`; disabled (and not focused) while the agent is executing
- **Inline download buttons:** `ChatMessage` carries optional `scheduleStudents` and `slotData` fields populated by `download_schedule` and `slots_ready` SSE events respectively. When present, one or both download buttons render below the reply text. `downloadSchedulePng` and `downloadSlotsPng` use `drawScheduleToCtx` / `drawSlotsToCtx` from `src/lib/timetable-canvas.ts` for pixel-identical output to the timetable tab PNG exports. `downloadCanvas` (also from the shared lib) handles the `<a>` click trigger.
- **Voice input:** `speechSupported` is a `useState(false)` set to `true` in a `useEffect` after mount (checks `SpeechRecognition` / `webkitSpeechRecognition` on `window`; works in Chrome, Edge, Safari — not Firefox). Using `useEffect` rather than `useMemo` is required to avoid SSR/client hydration mismatch — the server renders `false` and the client corrects it after hydration. Mic button is hidden when unsupported. `toggleVoice()` starts/stops a `SpeechRecognition` instance stored in `recognitionRef`. `cleanupRecognition(focus?)` is a shared helper called by both `onend` and `onerror` to deduplicate state reset. An unmount-cleanup `useEffect` calls `recognitionRef.current?.stop()` to release the mic if the component unmounts while listening.
