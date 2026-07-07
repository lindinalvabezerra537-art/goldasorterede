---
name: Artifact port assignments and workflow architecture
description: Port assignments per artifact, and how Start application and artifact workflows coexist without conflict
---

## Port assignments (platform-fixed, cannot be changed)

| Workflow | Port | Notes |
|---|---|---|
| `artifacts/api-server: API Server` | **8081** | Platform waits for this exact port |
| `artifacts/gol-da-sorte: web` | **24365** | Registered in `.replit` [[ports]]; artifact preview |
| `artifacts/mockup-sandbox: Component Preview Server` | **8080** | |
| `Start application` | **5000** | Main webview / preview pane (externalPort 80) |

## Architecture: how the four workflows coexist

The key rule: **only one process may own port 8081 at a time**.

- `artifacts/api-server: API Server` is the sole owner of port 8081.
- `Start application` runs **only the Vite frontend** on port 5000 (main preview pane). It does NOT start the API.
- `artifacts/gol-da-sorte: web` runs a second Vite instance on port 24365 (artifact-specific preview). Both Vite instances proxy `/api` to localhost:8081.
- The `Project` workflow (run button) starts both `Start application` AND `artifacts/api-server: API Server` in parallel via `.replit`.

## PORT env var injection

Artifact workflow commands are locked (cannot be overridden via `configureWorkflow`). PORT is baked into each `dev` script in `package.json`:
- `api-server/package.json`: `PORT=8081 pnpm run start`
- `gol-da-sorte/package.json`: `PORT=${PORT:-24365} vite ...` — falls back to 24365 when not set externally; start.sh calls vite via `pnpm exec` (not `pnpm run dev`) with `PORT=5000` to bypass the default.
- `mockup-sandbox/package.json`: `PORT=8080 vite dev`

## start.sh responsibility

`start.sh` (used by `Start application`) only starts the **frontend** Vite server on port 5000. It invokes vite via `pnpm exec vite` (not `pnpm run dev`) so that `PORT=5000` is not overridden by the package.json script default.

**Why:** If start.sh also started the API, it would conflict with `artifacts/api-server: API Server` on port 8081 whenever both workflows run together.

## Common failure pattern

If `Start application` is restarted before `artifacts/api-server: API Server` is stopped, the old start.sh (with API restart loop) may still be running and holding 8081, causing the artifact API workflow to fail with EADDRINUSE. Always check that no stale processes hold 8081 before debugging artifact failures.
