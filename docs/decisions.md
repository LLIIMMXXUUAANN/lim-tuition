# Frontend Design Decisions

Non-obvious decisions and the reasoning behind them. Code-level detail lives in `claude/`.

---

## Routing & API

**Catch-all proxy instead of individual API route files**
All `/api/*` browser requests are forwarded by a single handler at `src/app/api/[...path]/route.ts` rather than one file per endpoint. The alternative — a separate `route.ts` for every FastAPI endpoint — would require updating two files every time a backend route is added or renamed. The catch-all keeps the Next.js repo thin: the backend is the source of truth for routes, and the proxy just forwards. The only exception is a `PATH_MAP` for one URL mismatch (`generate-payment` → `payment/generate`) that couldn't be resolved on the backend side.

**snake_case / camelCase split — frontend owns the conversion**
The backend (FastAPI/Python) always speaks pure snake_case. The frontend converts at its two fetch boundaries:
- `src/lib/fastapi.ts` — applies `camelizeKeys()` to every JSON response for Server Components
- `src/app/api/[...path]/route.ts` — applies `camelizeKeys()` to every JSON response for client components
- SSE streams pass through the proxy unchanged; `AgentChat.tsx` applies `camelizeKeys(JSON.parse(data))` manually per event inside its reading loop

When sending to the backend, `decamelizeKeys()` (also in `src/lib/utils.ts`) is applied to the payload object before `JSON.stringify` — at the submission site in `StudentForm`, `PaymentGenerator`, and `TimetableSection`. Both utilities are hand-rolled in `src/lib/utils.ts` and cover the standard case (single-capital runs: `feePerHour → fee_per_hour`). All component code, types, and state use camelCase uniformly.

Where larger teams go further:

| What | Industry upgrade | Why |
|---|---|---|
| Hand-rolled `camelizeKeys` / `decamelizeKeys` | Use `humps` or `camelcase-keys` npm package | Handles edge cases like `HTMLParser → htmlParser` vs `h_t_m_l_parser` that the hand-rolled regex gets wrong |
| Hand-written `Student` type | Code-gen from FastAPI's OpenAPI spec (`openapi-typescript` + `orval`) | Types always in sync with backend schema, zero manual upkeep |
| Manual SSE parsing | Same — no better alternative for SSE | SSE isn't JSON, so manual per-event handling is correct regardless |

**Two-path API calling (Server Components vs client components)**
Server Components call the FastAPI backend directly via `fetchFastAPI` (injecting `X-Internal-Secret`), bypassing the catch-all proxy entirely. Client components call `fetch('/api/...')` which goes through the proxy. The reason: Server Components run on the server and can safely hold the internal secret; routing them through the proxy would be a pointless extra hop. Client components have no other choice — the FastAPI backend is not exposed to the browser directly.

**`proxy.ts` not `middleware.ts`**
Next.js 16 renamed the middleware file from `middleware.ts` to `proxy.ts` and the export from `middleware()` to `proxy()`. This is a breaking change from every Next.js tutorial and prior version. The file name and export must match exactly or route protection silently does nothing.

---

## UI & Components

**shadcn Select uses Base UI, not Radix**
This project's shadcn/ui was scaffolded with the Base UI (`@base-ui/react/select`) adapter rather than the default Radix adapter. The consequence: `SelectValue` renders the raw option value string, not a label. Wherever the display label differs from the stored value, a manual `<span>` inside `SelectTrigger` is required to show the correct text.

**Login pages use custom HTML, not shadcn `<Card>`**
Both login pages (`admin/login`, `student/login`) use a hand-written `div` structure rather than `<Card>`. Reason: the shadcn `Card` applies its own padding and border-radius that conflicted with the brand's exact shadow/border spec (`rounded-2xl shadow-sm border border-slate-100 p-10`). Using the primitive directly keeps both pages pixel-identical to each other and to the brand spec without fighting the component's defaults.

**`--primary: var(--color-navy)` in `globals.css`**
All shadcn `<Button>` instances are navy-coloured without any per-component override. This is done by overriding the `--primary` CSS variable to `var(--color-navy)` at the `:root` level in `globals.css`. The alternative — passing `variant` or `className` to every `<Button>` — would require touching dozens of call sites and would break silently whenever a new button is added without the override.

**Custom brand colours via `@theme {}`, not `tailwind.config.js`**
Tailwind v4 replaced `tailwind.config.js` theme extension with `@theme {}` blocks in CSS. The custom tokens (`navy`, `navyLight`, `accentGold`, `softBg`, `cardBg`) are defined in `globals.css` using this new API. Any attempt to define them in `tailwind.config.js` is silently ignored in v4.

**Hero background image uses inline `style`, not a Tailwind class**
Tailwind v4's JIT engine cannot parse `url(...)` inside arbitrary value classes like `bg-[url('/img.png')]`. The Hero section uses `style={{ backgroundImage: '...' }}` for the stacked gradient + image value. This is not a workaround to be "fixed" — it's the correct pattern for Tailwind v4.

**`backgroundAttachment: scroll` on Hero (not `fixed`)**
`background-attachment: fixed` creates a parallax-style effect but is broken on iOS Safari — the background image disappears or renders incorrectly when the viewport scrolls. The Hero explicitly leaves `backgroundAttachment` at its CSS default (`scroll`) for this reason. Do not change it to `fixed`.

---

## AgentChat

**`hydrated` flag gating localStorage save effects**
`AgentChat` has a `hydrated` boolean that must be `true` before any `useEffect` writes to localStorage. Without it, the save effect (which depends on `messages`) runs with `messages = []` on the first render — before the load effect's `setMessages(stored)` state update has committed — and wipes stored chat history. This race condition only manifests on navigation back to the page (not on hard refresh), making it hard to reproduce. The `hydrated` flag is also required to be safe under React StrictMode double-invocation in development.

**`useEffect` (not `useMemo`) for `speechSupported`**
The Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) lives on `window`, which does not exist during server-side rendering. Using `useMemo` to check for it would cause a hydration mismatch — the server renders `false` and the client would immediately compute a different value. `useEffect` runs only after hydration, so the server and client initial renders agree on `false`, and the client corrects to `true` silently after mount.

**`[student_id:NAME:UUID]` tokens in reply text, not structured JSON**
After create/update/setup operations, the backend appends `[student_id:NAME:UUID]` markers at the end of the agent's reply text rather than returning a separate structured field. The reason: the SSE stream emits text chunks incrementally — there is no single "done" payload where a structured field could live. Embedding tokens in the text stream means the frontend can extract them at render time regardless of how the stream was chunked. `parseAgentReply` strips the tokens before display so users never see them.

**`keepMounted` on the Slot Availability tab**
The timetable's Slot Availability tab uses `keepMounted` on its tab panel so the interactive grid and student availability textarea are not unmounted when the user switches to the Weekly Schedule tab. Without this, every tab switch resets the drag-painted grid state and the availability text the user typed — both of which are expensive to regenerate.

---

## Students

**Idempotency-Key rotation uses a deep-equal comparison, not `JSON.stringify`, and not a form-state-management library**
`StudentForm.tsx` reuses the same `Idempotency-Key` across a manual retry (correct — the retry should reuse the key), but must rotate to a fresh key if the user edits the form before resubmitting (otherwise the backend correctly rejects the stale-key resubmission with a 422, wasting a round-trip). Detecting "did the payload change since the last attempt" uses `fast-deep-equal` against a stored snapshot of the last-submitted payload, rather than:
- **`JSON.stringify(a) === JSON.stringify(b)`** — would work here (this payload's key order is stable across calls, no `undefined`/special-type fields), but only because of assumptions specific to this object's construction — it's key-order-sensitive, silently treats `undefined` as absent, and mishandles `Date`/`Map`/`Set`/`NaN` in general. A real equality check removes the need to rely on those assumptions holding.
- **A form-state-management library (React Hook Form, Formik)** — ships a built-in `isDirty` concept that would solve this same comparison, but adopting one means replacing this component's entire state model (currently a single `useState<StudentInsert>` + a hand-rolled `set()` helper) with the library's field-registration/validation/array-field/submission-handling machinery — a much larger, unrelated rewrite to solve one narrow comparison. Worth reconsidering if this app grows to many forms with complex cross-field validation; not proportionate for one moderately-sized form today.
