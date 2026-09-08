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

## Data fetching

**React Query (TanStack Query) scoped to client-side mutations + `AgentChat`'s two reads — not a full rewrite of Server Component data loading**
`StudentForm`, `TemplatesList`'s `TemplateCard`, `PaymentGenerator`, `TimetableSection`, `SyncAllButton`, and `AgentChat`'s two plain GET calls all use `useQuery`/`useMutation`. The students list/detail, templates, and timetable pages — which fetch their initial data via Server Components calling `fetchFastAPI` — were deliberately **not** converted to client-side `useQuery`. Two reasons, not one:

1. **TanStack Query's own official Next.js App Router guidance recommends this split.** Their documented pattern is: fetch on the server, hydrate that data into the client query cache, and let `useQuery` own *subsequent* refetching/invalidation from there — not replace the initial server fetch with a client-side one.
2. **Converting a Server Component to client-side fetching is treated as an anti-pattern in the Next.js App Router world**, not a legitimate alternative — it throws away the server-rendering benefits (no client-side loading spinner needed for first paint, less JS shipped) for no corresponding gain.

**Consequence: `router.refresh()` stays exactly where it was on `StudentForm`'s three mutations.** Nothing in a React Query cache represents the students list/detail pages' data (they're not loaded via `useQuery`), so there's nothing for `invalidateQueries` to invalidate there — `router.refresh()` remains what actually causes those Server-Component-rendered pages to re-fetch fresh data from FastAPI after a create/update/delete.

**Retry policy lives on the `QueryClient`'s default mutation options (`src/shared/components/QueryProvider.tsx`), not a per-call utility.** `shouldRetryMutation`/`mutationRetryDelay` (`src/shared/lib/httpError.ts`) implement exponential backoff + full jitter (AWS's documented algorithm) for network errors and `429`/`502`/`503`/`504` — never `409`/`422` (the idempotency-key conflict/mismatch codes from `StudentForm`'s create path; retrying those within this short budget can't resolve anything, and the existing manual-retry UI already handles them correctly). Every `mutationFn` in the app throws `HttpError` (carrying the HTTP status) rather than a bare `Error`, so this one shared policy applies uniformly without repeating retry config at each `useMutation` call site. This supersedes an earlier, separate `fetchWithRetry.ts` utility design that was considered but never built — `useMutation`'s built-in retry replaced the need for a bespoke fetch wrapper.

**`500` is deliberately excluded from the retryable set — matches the general/conservative industry default, not our own backend's error shape.** An earlier version of this policy included `500` (reasoned from this specific backend's broad `except Exception: raise HTTPException(500)` handler, where many `500`s really are transient DB/Supabase blips). That's a defensible reading of this codebase, but it diverges from the more conservative default most API-client guidance recommends: a bare `500` can also mean a real, permanent application bug, and blindly retrying a broken request just wastes time. Reverted to only auto-retrying `502`/`503`/`504` — the statuses that are unambiguously infrastructure-layer, not application-layer.

**`Retry-After` (RFC 7231) is respected for `429`, not just our own computed backoff.** `parseRetryAfterMs()` (`src/shared/lib/httpError.ts`) reads the header (numeric seconds or an HTTP-date) at the point each `mutationFn` throws `HttpError`, since React Query's `retry`/`retryDelay` callbacks only receive the thrown error, not the original `Response` — the value is carried on `HttpError.retryAfterMs` and preferred over the computed backoff in `mutationRetryDelay` when present. Matches what AWS's SDK and Stripe's client libraries do; previously this app computed its own backoff unconditionally, ignoring the header entirely.

**`AgentChat`'s SSE chat stream (`POST /api/agent/chat`) is deliberately not migrated.** React Query's `useQuery`/`useMutation` are both built around a single request → single resolved value lifecycle; neither has a primitive for one HTTP connection emitting many incremental, differently-typed events over its lifetime (`step`/`chunk`/`done`/`stopped`/`error`/`ui_action`). Forcing it in would mean hiding the same hand-rolled `fetch` + `ReadableStream` reader loop inside a `mutationFn` for no benefit — the same reason Vercel's own AI SDK ships `useChat` as bespoke code rather than a `useQuery` wrapper. Only the two plain GET calls around the stream (initial conversation load, reload-after-turn) and the two simple POSTs (clear, stop) were migrated.

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
