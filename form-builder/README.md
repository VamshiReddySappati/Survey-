# Custom Form Builder with Live Analytics

Full‑stack take‑home solution:
- **Frontend**: Next.js 14 (App Router) + Tailwind (no Formik/RHF) + Chart.js
- **Backend**: Go Fiber + MongoDB + WebSocket (native) for live analytics
- **DB**: MongoDB
- **Real-time**: WebSocket (`/ws?formId=<id>`)
- **Extra**: CSV export, conditional visibility support schema, dark mode, Docker Compose

## Quick Start (Local with Docker)

```bash
# 1) Clone and enter
# (You already have this if you downloaded the zip)
cd form-builder

# 2) Copy env examples (optional to tweak)
cp .env.example .env
cp apps/web/.env.local.example apps/web/.env.local

# 3) Build & run
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:8080/api
- WS:  ws://localhost:8080/ws
- MongoDB: mongodb://localhost:27017

### Demo Flow
1) On the landing page, click **Create Form** → it creates a draft and opens the builder.
2) Configure fields, **Save**, then **Publish**.
3) Open the share page `/f/:id` to submit responses.
4) Open the **Dashboard** `/dashboard/:id` and see live updates as new responses arrive (no reload).

## Run Locally (without Docker)

### Backend (API)
```bash
cd apps/api
go mod tidy
export MONGO_URI="mongodb://localhost:27017"
export MONGO_DB="formbuilder"
export API_PORT="8080"
go run .
```

### Frontend (Web)
```bash
cd apps/web
npm install
# Adjust .env.local if needed
npm run dev
```

## Production Hosting

### Option A: Render (or Railway/Fly.io) for API + MongoDB Atlas
1. **MongoDB**: Create a free MongoDB Atlas cluster; copy its connection string.
2. **API**: Deploy `apps/api` as a web service:
   - Set environment variables: `MONGO_URI`, `MONGO_DB` (e.g., `formbuilder`), `API_PORT=8080`.
3. **Web**: Deploy `apps/web` (Vercel/Netlify/Render static web service):
   - Set `NEXT_PUBLIC_API_BASE` to your deployed API URL (e.g., `https://<api-host>/api`)
   - Set `NEXT_PUBLIC_WS_BASE` to your deployed API WS (e.g., `wss://<api-host>/ws`)
4. Redeploy. Share your form link and dashboard links with reviewers.

### Option B: Single VM (Docker Compose)
- Copy this repo to a Linux VM.
- Set DNS to point to the VM.
- Add reverse proxy (Caddy / Nginx) for TLS & domain.
- Run `docker compose up -d --build` and configure proxy to forward 80/443 to `web:3000` and `api:8080`.

## API Overview
- `POST   /api/forms` create form (draft)
- `GET    /api/forms/:id` get form
- `PUT    /api/forms/:id` update form
- `POST   /api/forms/:id/publish` publish
- `POST   /api/responses` submit response `{formId, answers}`
- `GET    /api/analytics/:formId/summary` current aggregates
- `GET    /api/forms/:id/export?format=csv` export responses CSV
- `WS     /ws?formId=<id>` live `response:created` events

## .env
- Root `.env` is optional.
- API service uses environment variables (see `apps/api/README.md` inside code comments).
- Web uses `.env.local`:
  - `NEXT_PUBLIC_API_BASE=http://localhost:8080/api`
  - `NEXT_PUBLIC_WS_BASE=ws://localhost:8080/ws`

## Notes
- No Formik/React Hook Form. Custom hooks manage state/validation.
- Drag‑and‑drop uses native HTML5 events in the builder.
- Analytics aggregates are merged live in the dashboard; initial state from `/summary` then updated by WebSocket events.
- CSV export available for reviewers.