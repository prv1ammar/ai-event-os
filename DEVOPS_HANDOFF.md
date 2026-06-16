# AI EVENT OS — DevOps Handoff Document

**Version:** 1.0.0  
**Date:** June 2026  
**Prepared for:** DevOps Team  
**Repository:** https://gitlab.tybotflow.com/root/ai-events.git  

---

## 1. Project Overview

**AI EVENT OS** is a full-stack enterprise event management platform built for organizing professional exhibitions, conferences, and trade shows. It provides a centralized operating system for event organizers to manage visitors, exhibitors, leads, schedules, badges, QR codes, finances, and marketing campaigns — all connected to live data via the TybotFlow SmartApp API.

### Key Features
- Multi-event management with per-event data isolation
- Visitor & exhibitor registration with QR badge generation
- Camera-based QR code scanner (mobile-compatible)
- Lead capture and scoring system
- Financial tracking (invoices, payments, budget) in MAD currency
- Email campaigns and automated workflows
- Real-time WebSocket dashboard
- AI-powered lead scoring and analytics
- Export to PDF, Excel, and PowerPoint

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENT BROWSER                          │
│               React 19 + Vite + TanStack Router                  │
│                        (Port 5173 / 80)                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS / REST / WebSocket
┌──────────────────────────▼──────────────────────────────────────┐
│                       FASTAPI BACKEND                            │
│              Python 3.11 + Uvicorn (Port 8001)                   │
│         30+ REST endpoints · WebSocket · JWT Auth                │
└───────┬───────────────────┬──────────────────┬──────────────────┘
        │                   │                  │
┌───────▼──────┐   ┌────────▼──────┐   ┌──────▼──────────────────┐
│    Redis     │   │ Celery Worker │   │   TybotFlow SmartApp     │
│  (Queue +    │   │  (Email,      │   │   REST API (Database)    │
│   Cache)     │   │  Analytics,   │   │ api.tybotflow.com        │
│  Port 6379   │   │  Reports)     │   │                          │
└──────────────┘   └───────────────┘   └──────────────────────────┘
        │
┌───────▼──────┐
│ Celery Beat  │
│  (Scheduler) │
└──────────────┘
```

> **Note:** The database is **TybotFlow SmartApp** (cloud REST API). There is no local PostgreSQL in production — the `docker-compose.yml` includes Postgres for local dev reference only. The app does not use Postgres in its current implementation.

---

## 3. Tech Stack

### Backend
| Component | Technology | Version |
|---|---|---|
| Language | Python | 3.11 |
| Framework | FastAPI | 0.111.0 |
| Server | Uvicorn | 0.29.0 |
| Auth | python-jose (JWT) | 3.3.0 |
| HTTP Client | httpx (async) | 0.27.0 |
| Task Queue | Celery | 5.4.0 |
| Cache / Broker | Redis | 5.0.4 |
| AI / ML | OpenAI, scikit-learn, pandas | latest |
| PDF Export | ReportLab | 4.2.0 |
| Excel Export | openpyxl | 3.1.3 |
| PPT Export | python-pptx | 0.6.23 |
| QR Codes | qrcode + Pillow | 7.4.2 / 10.3.0 |
| Email | SendGrid | 6.11.0 |
| WebSockets | websockets | 12.0 |

### Frontend
| Component | Technology | Version |
|---|---|---|
| Language | TypeScript | 5.8 |
| Framework | React | 19.x |
| Build Tool | Vite | 7.x |
| Routing | TanStack Router | 1.x |
| Data Fetching | TanStack Query | 5.x |
| UI Components | Shadcn/UI + Radix UI | latest |
| Styling | Tailwind CSS | 4.x |
| Charts | Recharts | 2.x |
| Forms | React Hook Form + Zod | 7.x / 3.x |
| QR Generation | react-qr-code | 2.x |
| QR Scanning | html5-qrcode | 2.3.8 |

---

## 4. Repository Structure

```
ai-events/
├── backend/                  # FastAPI application
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py         # Pydantic BaseSettings (.env)
│   │   │   ├── security.py       # JWT create/verify
│   │   │   └── tybot_client.py   # TybotFlow HTTP client
│   │   ├── routers/              # API route handlers (one file per domain)
│   │   │   ├── auth.py
│   │   │   ├── events.py
│   │   │   ├── visitors.py
│   │   │   ├── exhibitors.py
│   │   │   ├── leads.py
│   │   │   ├── badges.py
│   │   │   ├── scans.py
│   │   │   ├── finance.py
│   │   │   ├── campaigns.py
│   │   │   ├── reports.py
│   │   │   ├── ai.py
│   │   │   └── ...
│   │   ├── schemas/              # Pydantic request/response models
│   │   ├── tasks/                # Celery async tasks
│   │   │   ├── celery_app.py
│   │   │   ├── email_tasks.py
│   │   │   ├── analytics_tasks.py
│   │   │   ├── report_tasks.py
│   │   │   └── scoring_tasks.py
│   │   ├── websockets/           # Real-time WebSocket handlers
│   │   ├── webhooks/             # Stripe / CMI payment webhooks
│   │   ├── templates/emails/     # Jinja2 HTML email templates
│   │   └── main.py               # App factory + router registration
│   ├── .env                      # Secrets (DO NOT COMMIT)
│   ├── .env.example
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── requirements.txt
│
├── frontend/                 # React + Vite application
│   ├── src/
│   │   ├── components/           # Shared UI components
│   │   ├── components/ui/        # Shadcn primitives
│   │   ├── lib/
│   │   │   ├── api.ts            # apiRequest() helper
│   │   │   ├── auth.ts           # Token storage
│   │   │   └── event-context.tsx # Global active-event state
│   │   └── routes/               # 15 page routes
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── DEVOPS_HANDOFF.md         # This document
└── README.md
```

---

## 5. Environment Variables

Create `backend/.env` from `backend/.env.example`:

```env
# ── TybotFlow SmartApp (REQUIRED) ─────────────────────────────────
TYBOT_API_URL=https://api.tybotflow.com
TYBOT_API_KEY=twx_vYb7cgYNPxvVrPYV_221
TYBOT_BASE_ID=ponz2aspv049r7c

# ── Auth (REQUIRED — change SECRET_KEY in production!) ────────────
SECRET_KEY=CHANGE_THIS_TO_A_RANDOM_64_CHAR_STRING_IN_PRODUCTION
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# ── CORS (set to your production domain) ──────────────────────────
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# ── App ───────────────────────────────────────────────────────────
APP_ENV=production
APP_NAME=AI EVENT OS
APP_VERSION=1.0.0

# ── External APIs (OPTIONAL) ──────────────────────────────────────
SENDGRID_API_KEY=your_sendgrid_key_here
OPENAI_API_KEY=your_openai_key_here

# ── Redis / Celery (REQUIRED if using email/analytics tasks) ──────
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/2
```

> **Security:** Always rotate `SECRET_KEY` before production deployment. Generate with:  
> `python -c "import secrets; print(secrets.token_hex(32))"`

---

## 6. Local Development Setup

### Prerequisites
- Python 3.11+
- Node.js 20+
- Git

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # then fill in values
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### Demo Login
| Field | Value |
|---|---|
| Email | `admin@aievent.ma` |
| Password | `Admin1234!` |

---

## 7. Docker Deployment

### Build & Start All Services
```bash
cd backend
cp .env.example .env    # fill in real values first
docker compose up -d --build
```

### Services Started by Docker Compose
| Container | Role | Port |
|---|---|---|
| `aievents_api` | FastAPI backend | 8000 |
| `aievents_redis` | Cache + message broker | 6379 |
| `aievents_celery` | Async task worker | — |
| `aievents_celery_beat` | Scheduled task runner | — |
| `aievents_flower` | Celery monitoring UI | 5555 |

### Frontend (separate — build static files)
```bash
cd frontend
npm install
npm run build
# dist/ folder → serve via Nginx or CDN
```

---

## 8. Production Deployment Recommendation

### Recommended Stack
```
Internet → Nginx (reverse proxy + SSL termination)
              ├── /api/v1/*    → FastAPI (gunicorn + uvicorn workers)
              ├── /ws/*        → FastAPI WebSocket
              └── /*           → React static build (dist/)
```

### Nginx Config Snippet
```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    # React frontend (static)
    root /var/www/aievent/dist;
    index index.html;
    try_files $uri $uri/ /index.html;

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket proxy
    location /ws/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Gunicorn Command (production)
```bash
gunicorn app.main:app \
  -w 4 \
  -k uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8001 \
  --timeout 120 \
  --access-logfile - \
  --error-logfile -
```

### Celery Worker (production)
```bash
celery -A app.tasks.celery_app.celery_app worker \
  --loglevel=info \
  --concurrency=4 \
  -Q celery,email,reports,analytics
```

---

## 9. API Overview

**Base URL:** `http://localhost:8001/api/v1/`  
**Authentication:** JWT Bearer token in `Authorization` header  
**Docs:** `http://localhost:8001/docs` (Swagger UI)

### Key Endpoints
| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | Login, returns JWT token |
| GET | `/events` | List all events |
| GET | `/visitors?event_id=1&limit=500` | Visitors per event |
| POST | `/visitors` | Create visitor |
| GET | `/exhibitors?event_id=1&limit=500` | Exhibitors per event |
| POST | `/exhibitors/{id}/assign-event` | Assign exhibitor to event |
| GET | `/leads?event_id=1&limit=500` | Leads per event |
| GET | `/badges` | Badge type definitions |
| POST | `/scans/lookup` | QR code scan lookup |
| GET | `/analytics/dashboard` | Dashboard KPIs |
| GET | `/reports/export` | Generate PDF/Excel report |

---

## 10. Database — TybotFlow SmartApp

The application uses **TybotFlow SmartApp** as its database — a cloud-hosted REST API (no SQL, no migrations).

| Setting | Value |
|---|---|
| Base URL | `https://api.tybotflow.com` |
| Auth Header | `Authorization: twx_vYb7cgYNPxvVrPYV_221` |
| Base ID | `ponz2aspv049r7c` |
| Read Records | `GET /api/v1/data/{table}` |
| Write Records | `POST/PATCH/DELETE /api/v1/smart-db/tables/{table_id}/records` |

### Table IDs (Production)
| Table | ID |
|---|---|
| events | *(see routers/events.py)* |
| visitors | `mczsulpngbjjif5` |
| exhibitors | `mrdg571gqvhuiz0` |
| leads | `mi2q9y1gl4fiq52` |
| scans | `mfvqg4myn20sf2l` |

> All table IDs are defined as `TABLE_ID` constants at the top of each router file in `backend/app/routers/`.

---

## 11. WebSocket Endpoints

| Path | Description |
|---|---|
| `ws://host/ws/dashboard` | Real-time dashboard stats |
| `ws://host/ws/scans` | Live QR scan feed |

---

## 12. Infrastructure Requirements

### Minimum Server Specs (Production)
| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 2 GB | 4 GB |
| Disk | 20 GB SSD | 40 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

### Required Services on Server
- Python 3.11
- Node.js 20+ (build only — not needed at runtime)
- Redis 7+
- Nginx
- Certbot (Let's Encrypt SSL)
- Supervisor or systemd (process management)

---

## 13. External Services & API Keys Needed

| Service | Purpose | Required |
|---|---|---|
| TybotFlow SmartApp | Database (already configured) | YES — already active |
| SendGrid | Transactional email | YES (for email campaigns) |
| OpenAI API | AI lead scoring + suggestions | Optional |
| Stripe / CMI | Payment processing | Optional |

---

## 14. CI/CD Recommendation

### GitLab CI Pipeline (`.gitlab-ci.yml`)
```yaml
stages:
  - test
  - build
  - deploy

test-backend:
  stage: test
  image: python:3.11
  script:
    - cd backend && pip install -r requirements.txt
    - pytest --cov=app

build-frontend:
  stage: build
  image: node:20
  script:
    - cd frontend && npm ci && npm run build
  artifacts:
    paths:
      - frontend/dist/

deploy-production:
  stage: deploy
  only:
    - main
  script:
    - rsync -az frontend/dist/ user@server:/var/www/aievent/dist/
    - ssh user@server "cd /opt/aievent && git pull && pip install -r backend/requirements.txt && systemctl restart aievent-api aievent-celery"
```

---

## 15. Estimated Costs (Monthly)

| Service | Cost |
|---|---|
| VPS (4 vCPU, 4 GB RAM) | ~$20–40/mo |
| Redis (managed, optional) | ~$10/mo or self-hosted free |
| TybotFlow SmartApp | Existing subscription |
| SendGrid (up to 100k emails) | Free–$20/mo |
| OpenAI API | Pay-per-use (~$5–20/mo) |
| Domain + SSL (Let's Encrypt) | ~$15/yr |
| **Total Estimate** | **~$40–80/month** |

---

## 16. Development Effort Summary

| Phase | Time (1 senior dev) |
|---|---|
| Architecture & API design | 1 week |
| Backend — all routers, schemas, auth | 3 weeks |
| Frontend — 15 pages, components, routing | 4 weeks |
| QR system (generation + camera scanner) | 1 week |
| Multi-event context & filtering | 1 week |
| AI/ML analytics & lead scoring | 2 weeks |
| Email, reports, export (PDF/Excel/PPT) | 1 week |
| Testing, QA, bug fixes | 2 weeks |
| **Total** | **~15 weeks** |

> With 2 developers (1 backend + 1 frontend): **~8 weeks**

### Codebase Size
| | |
|---|---|
| Backend Python | ~4,550 lines |
| Frontend TypeScript/TSX | ~9,050 lines |
| API Endpoints | 30+ |
| Pages / Routes | 15 |
| Git Commits | 27 |

---

## 17. Contacts & Access

| | |
|---|---|
| GitLab Repo | https://gitlab.tybotflow.com/root/ai-events.git |
| Demo URL (local) | http://localhost:5173 |
| API Docs | http://localhost:8001/docs |
| Demo Login | `admin@aievent.ma` / `Admin1234!` |
| TybotFlow Dashboard | https://app.tybotflow.com |

---

*Document generated June 2026 — AI EVENT OS v1.0.0*
