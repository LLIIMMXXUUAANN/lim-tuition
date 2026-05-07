# AI Agent Design — Student Management

**Date:** 2026-05-07
**Scope:** v1 — Students CRUD only (no Google integrations)

---

## Overview

A dedicated admin page (`/admin/agent`) where the tutor types natural language commands to create, update, search, or delete students. A Gemini 2.5 Flash agent interprets the command, asks follow-up questions when information is missing, executes the action directly against Supabase, and self-evaluates that the change persisted.

---

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| UI placement | Dedicated page `/admin/agent` | Needs space for multi-step output, errors, and tool steps |
| Scope | Students CRUD only | Simplest starting point; Google integrations in v2 |
| Missing info handling | Ask follow-up questions | Agent always confirms before acting on incomplete commands |
| Model | Gemini 2.5 Flash | Already configured (`GEMINI_API_KEY`); strong tool use support |
| Architecture | Gemini function calling (`@google/genai` v1.x) | Handles multi-turn natively; robust on ambiguous input |
| Backend state | Stateless | Conversation history lives in React state, sent with each request |
| Frontend persistence | `localStorage` | Conversation survives page refresh without DB changes |
| Chat UI | Centered chat column | Clean, focused; tool steps inline in agent bubbles |

---

## Architecture

```
Browser (React state)            /api/agent/chat              Supabase
─────────────────────            ───────────────              ────────
Chat UI                  →       POST with { messages }  →   students table
 messages[]                      │
 input box                       │ 1. requireTutor() auth check
 localStorage sync               │ 2. Build Gemini chat with tool definitions
                                 │ 3. Send full conversation history
                                 │ 4. Gemini responds: text OR tool_call
                                 │
                                 │── if tool_call ──────────────────────┐
                                 │   execute tool fn against Supabase    │
                                 │   feed result back to Gemini          │
                                 │   Gemini writes final response        │
                                 │                                       │
                                 │── self-eval (mutating ops only) ──────┘
                                 │   re-query Supabase to verify change
                                 │   append ✓/⚠ verification to reply
                                 │
                          ←      { reply, steps[] }
```

**Key constraints:**
- Max 5 tool-call rounds per user message (infinite loop guard)
- `delete_student` requires explicit user confirmation in the conversation before Gemini may call it

---

## Tools (Function Definitions)

All tools are implemented as plain async functions inside `/api/agent/chat/route.ts`. They call Supabase directly via the server client — no internal HTTP calls.

| Tool | Parameters | Action |
|---|---|---|
| `search_students` | `query: string` | SELECT from `students` WHERE name ILIKE `%query%`. Returns `id`, `name`, `status`, `fee_per_hour`, `class_schedule`. Used before update/delete to resolve the correct row ID, and after mutations for self-evaluation. |
| `create_student` | `name`, `mode`, `fee_per_hour`, `payment_method`, `status`, `schedule?`, `contact_person?`, `contact_phone?` | INSERT into `students`. Defaults: `status = 'Active'`, `payment_method = 'Monthly'`. |
| `update_student` | `id`, `fields: Partial<StudentUpdate>` | UPDATE `students` WHERE `id`. Gemini must call `search_students` first to obtain the `id`. |
| `delete_student` | `id` | DELETE FROM `students` WHERE `id`. Only callable after explicit user confirmation ("yes") in the conversation. |

---

## Multi-turn Conversation Flow

Conversation history is passed as a `messages` array on every request. The backend is fully stateless — no session store needed.

**Create flow (missing info):**
```
User:  "Create student LX"
Agent: calls search_students("LX") → not found
Agent: "What's LX's schedule, fee, and mode?"
User:  "Mon 3–5pm, RM 60/hr, IGCSE"
Agent: calls create_student({ name:"LX", schedule:[{day:"Monday",start:"15:00",end:"17:00"}], fee_per_hour:60, mode:"IGCSE", ... })
       → self-eval: search_students("LX") → found ✓
Agent: "Done — student LX created (RM 60/hr, Mon 3–5pm). View LX →"
```

**Update flow:**
```
User:  "Change LX's fee to RM 80"
Agent: calls search_students("LX") → [{ id:"abc", name:"Lim Xuan", fee_per_hour:60 }]
Agent: "Found Lim Xuan (currently RM 60/hr). Update to RM 80/hr?"
User:  "Yes"
Agent: calls update_student("abc", { fee_per_hour:80 })
       → self-eval: search_students("LX") → fee_per_hour=80 ✓
Agent: "Done — Lim Xuan's fee updated to RM 80/hr ✓"
```

**Delete flow:**
```
User:  "Delete student LX"
Agent: calls search_students("LX") → [{ id:"abc", name:"Lim Xuan" }]
Agent: "Found Lim Xuan. Are you sure you want to permanently delete this student? Type yes to confirm."
User:  "Yes"
Agent: calls delete_student("abc")
       → self-eval: search_students("LX") → not found ✓
Agent: "Lim Xuan has been deleted ✓"
```

**Ambiguous name:**
```
User:  "Update John's schedule"
Agent: calls search_students("John") → 3 results
Agent: "Found 3 students named John: John Tan, John Lim, John Wong. Which one did you mean?"
```

---

## Error Handling & Retry

Tool execution errors are returned as the function result and fed back into the Gemini conversation. Gemini decides how to recover — no special retry code needed.

| Error scenario | Agent behaviour |
|---|---|
| Supabase error on insert | Reports error, asks user to try again or correct the input |
| Duplicate student name | "A student named X already exists. Update them instead?" |
| Multiple name matches | Lists all matches, asks user to clarify |
| No matches found | "No student found named X. Create them instead?" |
| Max rounds exceeded (5) | Reports partial progress and what remains to be done manually |

---

## Self-Evaluation

After every `create_student`, `update_student`, or `delete_student`, the backend (not Gemini) directly re-queries Supabase, checks the result, and appends a verification line to the final reply string before returning to the browser:

| Action | Verification |
|---|---|
| create | `search_students(name)` → row exists with correct fields |
| update | `search_students(name)` → updated fields match requested values |
| delete | `search_students(name)` → row no longer exists |

Response suffix:
- `✓ verified in DB` — change confirmed
- `⚠ could not verify` — re-query failed; user should confirm manually

---

## Frontend — Chat UI

**Route:** `src/app/admin/(app)/agent/page.tsx`

**Layout:** Centered column (max-width ~600px), full-height chat, matching existing admin nav.

**Components:**
- `src/components/agent/AgentChat.tsx` — client component, owns `messages` state + `localStorage` sync
- Message bubbles: user (navy, right-aligned) / agent (white card, left-aligned)
- Tool steps shown as small muted text inside agent bubbles (e.g. `🔧 searching students...`)
- "View student →" link rendered in agent bubble after create/update
- Loading state: `⋯` typing indicator while waiting for API response
- Clear conversation button (top-right of page)

**Request shape:**
```ts
POST /api/agent/chat
{ messages: { role: 'user' | 'model', content: string }[] }
```

**Response shape:**
```ts
{
  reply: string,    // Gemini's final text response to display in the chat bubble
  steps: string[]   // ordered list of tool calls made, e.g. ["🔍 search_students(\"LX\")", "➕ create_student(...)"]
                    // shown as small muted lines inside the agent bubble
}
```

---

## File Structure

```
src/
  app/
    admin/(app)/
      agent/
        page.tsx                 ← Server Component (thin wrapper)
  components/
    agent/
      AgentChat.tsx              ← Client Component (chat UI + state)
  app/api/
    agent/
      chat/
        route.ts                 ← POST handler: Gemini loop + tool dispatch + self-eval
```

---

## Out of Scope (v1)

- Google Calendar / Drive integration (v2)
- Template editing via agent
- Timetable commands
- Conversation history persisted to Supabase
- Streaming responses
