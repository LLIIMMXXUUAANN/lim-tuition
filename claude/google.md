## Google Drive + Calendar integration

Admin-only features for managing a student's Google Drive folder and weekly recurring Google Calendar events. All service logic (Drive/Calendar API calls, OAuth2) lives in `tuition-api/app/features/google/`. The frontend calls these via the catch-all proxy.

- **`src/features/students/components/SyncAllButton.tsx`** — always shown at the bottom of the students list; see Key components in `claude/ui.md`

**Google setup flow:** Google Calendar events and Drive folders are set up via the AI agent using the `setup_student_google` tool (triggered after `create_student` or `update_student` if no Google resources exist). For subsequent schedule changes, saving `StudentForm` calls `PUT /api/students/{id}` — the backend patches Calendar events and rewrites the Drive Meet doc automatically if `calendar_event_ids` exist. Use **Sync Google** (SyncAllButton) to repair any student whose Calendar or Drive state is out of sync.

**One-time OAuth setup:** visit `/api/google/auth` as admin — Next.js fetches the OAuth consent URL from the backend and redirects the browser; after consent, Google redirects to `/api/google/callback` which saves the refresh token via the backend. See `tuition-api/README.md` for full OAuth + env var setup.
