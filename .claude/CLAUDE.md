# AI EVENT OS — Main Agent Instructions

## Project Overview
AI EVENT OS is an enterprise event management platform.
Backend: Python FastAPI. Frontend: Next.js 14 + TypeScript.
Database: PostgreSQL + Redis. Task queue: Celery.

## Tech Stack
- **Backend**: FastAPI, SQLAlchemy 2.0 (async), Alembic, Pydantic v2, Celery, Redis
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, React Query, Shadcn/UI
- **Database**: PostgreSQL (primary), Redis (cache + pub/sub)
- **AI/ML**: scikit-learn, pandas, numpy, OpenAI API
- **File generation**: ReportLab (PDF), python-pptx (PPT), openpyxl (Excel)
- **QR Codes**: qrcode, Pillow
- **Auth**: JWT (python-jose), bcrypt, OAuth2PasswordBearer

## Project Structure
```
ai-event-os/
├── app/
│   ├── main.py
│   ├── core/
│   │   ├── config.py       # Pydantic BaseSettings
│   │   ├── database.py     # SQLAlchemy async engine
│   │   └── security.py     # JWT + bcrypt
│   ├── models/             # SQLAlchemy ORM models
│   ├── schemas/            # Pydantic request/response
│   ├── routers/            # FastAPI APIRouter per module
│   ├── services/           # Business logic layer
│   └── tasks/              # Celery async tasks
├── alembic/                # DB migrations
├── tests/                  # pytest test suite
├── frontend/               # Next.js app
└── docker-compose.yml
```

## Global Coding Rules
- Always use `async/await` in FastAPI routes and SQLAlchemy queries
- Use Pydantic v2 schemas for ALL request and response models
- Every endpoint must have `response_model=` defined
- Write pytest tests for every new endpoint (coverage > 80%)
- Use `Depends(get_db)` and `Depends(get_current_user)` on protected routes
- All API routes prefixed with `/api/v1/`
- Pagination on all list endpoints: `?page=1&limit=20`
- Currency: always **MAD** (Moroccan Dirham) — never USD or EUR
- Never hardcode secrets — use `.env` + Pydantic `BaseSettings`
- HTTP status codes: 201 for POST creation, 404 with `detail` message
- All models must have: `id` (UUID), `created_at`, `updated_at`

## Sub-Agents Available
Delegate tasks to the appropriate specialized agent:

| Agent | Responsibility |
|---|---|
| `foundation-agent` | DB models, auth, Docker, migrations |
| `events-api-agent` | Events, Exhibitors, Booths, Sessions, Speakers |
| `visitors-qr-agent` | Visitors, Tickets, QR codes, Badges, Scan access |
| `marketing-leads-agent` | Leads, Campaigns, Email automation, Relances |
| `finance-agent` | Payments, Budget, Invoices, Financial KPIs |
| `analytics-ai-agent` | Real-time analytics, AI scoring, Matchmaking, Reports |

## Environment Variables Required
```
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/aievent
REDIS_URL=redis://localhost:6379
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
SENDGRID_API_KEY=your-sendgrid-key
OPENAI_API_KEY=your-openai-key
```
