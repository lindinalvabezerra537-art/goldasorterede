---
name: API Server port fix
description: Artifact-managed workflow port assignments — which port each artifact expects
---

Each artifact workflow has a platform-assigned port it MUST bind to. These are fixed by the artifact system and cannot be changed via configureWorkflow (managed workflows are read-only).

| Artifact workflow | Expected port | Notes |
|---|---|---|
| `artifacts/api-server: API Server` | **8081** | Platform waits for this port; set via `PORT=8081` in dev script |
| `artifacts/gol-da-sorte: web` | **24365** | Registered in `.replit` [[ports]]; set via `PORT=24365` in dev script |
| `artifacts/mockup-sandbox: Component Preview Server` | **8080** | Set via `PORT=8080` in dev script |

PORT is baked into each artifact's `dev` script in its `package.json` (not the workflow command, which is locked).

The Vite proxy in `artifacts/gol-da-sorte/vite.config.ts` proxies `/api` to `http://localhost:${API_PORT ?? "8081"}`.

`start.sh` (used by any manual "Start application" workflow) also uses PORT=8081 for the API and PORT=5000 for the frontend.

**Why:** Replit's artifact system assigns fixed ports per artifact and waits for those exact ports. Setting a different PORT causes the workflow to time out with "didn't open port XXXX".

**How to apply:** Never change the PORT in the dev scripts without first confirming the platform's expected port from the workflow error message ("didn't open port N").
