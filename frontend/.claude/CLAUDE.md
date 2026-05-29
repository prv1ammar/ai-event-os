# AI EVENT OS — Main Agent Instructions

## Project Overview
AI EVENT OS is an enterprise event management platform.
Backend: Python FastAPI. Frontend: Vite + React + TypeScript.
Database: TybotFlow SmartApp (REST API — no SQL, no migrations).

## Tech Stack
- **Backend**: FastAPI, Pydantic v2, python-jose (JWT), httpx (TybotFlow client)
- **Frontend**: Vite, React, TypeScript, Tailwind CSS, TanStack Router v1, TanStack Query v5, Shadcn/UI
- **Database**: TybotFlow SmartApp API (`https://api.tybotflow.com`)
- **Auth**: JWT signed by backend — credentials validated via TybotFlow login OR demo bypass
- **AI/ML**: scikit-learn, pandas, numpy, OpenAI API
- **File generation**: ReportLab (PDF), python-pptx (PPT), openpyxl (Excel)
- **QR Codes**: qrcode, Pillow
- **Email**: SendGrid + Jinja2 HTML templates
- **Optional queue**: Celery + Redis (email/analytics tasks — not required to run the app)

## Project Structure
```
Platform-AI-Event/
├── ai-event-os/              # FastAPI backend
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py     # Pydantic BaseSettings (.env)
│   │   │   ├── security.py   # JWT create/verify
│   │   │   └── tybot_client.py  # TybotFlow HTTP client
│   │   ├── routers/          # One file per domain (events, exhibitors, …)
│   │   ├── schemas/          # Pydantic request/response models
│   │   ├── tasks/            # Celery async tasks (email, analytics)
│   │   ├── templates/emails/ # Jinja2 HTML email templates
│   │   ├── webhooks/         # Stripe / CMI webhook handlers
│   │   ├── websockets/       # Real-time WS (scans, dashboard)
│   │   └── main.py           # App factory + router registration
│   ├── .env                  # Secrets (gitignored)
│   ├── .env.example
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── requirements.txt
├── src/                      # React frontend
│   ├── components/           # Shared UI (AppHeader, AppSidebar, …)
│   ├── components/ui/        # Shadcn primitives
│   ├── hooks/
│   ├── lib/
│   │   ├── api.ts            # apiRequest + smartDbRequest helpers
│   │   ├── auth.ts           # localStorage token helpers
│   │   └── event-context.tsx # Active-event global state
│   └── routes/               # TanStack Router file-based routes
├── index.html
├── vite.config.ts
└── package.json
```

## TybotFlow API
- **Base URL**: `https://api.tybotflow.com`
- **Auth header**: `Authorization: twx_<api_key>` (NOT "Bearer")
- **Base ID**: `ponz2aspv049r7c`
- **Read**: `GET /api/v1/data/{table}` with `Accept-Profile: {base_id}`
- **Write**: `POST/PATCH/DELETE /api/v1/smart-db/tables/{table_id}/records`
- All table IDs are defined as `TABLE_ID` constants at the top of each router file.

## Backend Coding Rules
- All routes use `async/await`
- Use Pydantic v2 schemas for ALL request/response models
- Every endpoint has `response_model=` defined
- Use `Depends(get_tybot)` for DB access, `Depends(get_current_user_payload)` for auth
- All API routes prefixed with `/api/v1/`
- Pagination on list endpoints: `?page=1&limit=20`
- Currency: always **MAD** (Moroccan Dirham)
- Never hardcode secrets — use `.env` + Pydantic `BaseSettings`
- HTTP status: 201 for POST creation, 404 with `detail` message
- No SQLAlchemy, no Alembic, no raw SQL — TybotFlow is the only data store

## Frontend Coding Rules
- Auth token stored in `localStorage` key `aievent_auth_token`
- All API calls go through `apiRequest()` in `src/lib/api.ts`
- Mutations use `smartDbRequest(table, method, data)` from `src/lib/api.ts`
- Auth guard lives in `src/routes/__root.tsx` — synchronous redirect via `window.location.replace`
- Active event state comes from `EventProvider` in `src/lib/event-context.tsx`

## Demo Login
- **Email**: `admin@aievent.ma`
- **Password**: `Admin1234!`
- Bypass is in `ai-event-os/app/routers/auth.py` → `_DEMO_USERS` dict

## Environment Variables
```
TYBOT_API_URL=https://api.tybotflow.com
TYBOT_API_KEY=twx_vYb7cgYNPxvVrPYV_221
TYBOT_BASE_ID=ponz2aspv049r7c
SECRET_KEY=change-me-to-a-very-long-random-string-at-least-32-chars
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:5174
```

## Running Locally
```bash
# Backend (port 8001)
cd ai-event-os
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# Frontend (port 5173)
npm run dev
```
