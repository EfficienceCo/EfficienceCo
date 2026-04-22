# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EfficienceCo is a SaaS platform for accounting and administration offices that automates manual file-management processes. The system uses a **hybrid cloud-local architecture**:
- **Cloud**: Frontend (Vercel), Backend API (Railway), Database (Supabase/PostgreSQL)
- **Local**: Python agent running on client machines for file automation

## Team Ownership

| Area | Owner | Tech |
|------|-------|------|
| Backend API | João | Node.js + Express + Stripe |
| Frontend | Victor | React 18 + Next.js 14 + Tailwind |
| Local Agent | Gabriel | Python 3 + PyInstaller |
| Database | Vinícius | PostgreSQL + Supabase |

## Commands

### Backend (`/backend`)
```bash
npm install
npm run dev       # nodemon dev server on port 3001
npm start         # production
```

### Frontend (`/frontend`)
```bash
npm install
npm run dev       # Next.js dev server
npm run build
npm start
```

### Agent (`/agente`)
```bash
pip install -r requirements.txt
python main.py
bash build/build.sh   # package into .exe with PyInstaller
```

### Database (`/database`)
SQL migration files in `/database/migrations/` — run manually against Supabase or local PostgreSQL.

## Architecture

### Data Flow
```
Frontend  →  Backend API  →  Supabase (PostgreSQL)
Agent     →  Backend API  →  Supabase (PostgreSQL)
```
Neither the frontend nor the agent ever talk directly to the database — all access goes through the backend API.

### Authentication
JWT tokens issued at `POST /auth/login`. All protected routes require the token in the `Authorization` header. Role-based access control distinguishes three roles: Efficience admin, client admin, and client employee.

### Backend Structure (`/backend/src`)
- `routes/` — Express route definitions (auth, clientes, usuarios, licenca, regras, eventos, webhook)
- `controllers/` — Request handlers for each route group
- `services/` — Business logic (auth, licenca, stripe)
- `middlewares/` — JWT validation and role-permission checks
- `config/` — Database (Supabase client) and Stripe setup
- `server.js` / `app.js` — Express bootstrapping

### Frontend Structure (`/frontend/src`)
- `app/` — Next.js App Router pages (`dashboard/` for clients, `admin/` for Efficience team)
- `components/` — Shared UI components (Button, Input, Modal, Table, Sidebar, Header, LogCard, StatusLicenca)
- `context/` — `AuthContext` with JWT state
- `hooks/` — `useAuth`, `useApi`
- `services/` — Axios wrappers (api.js base, plus per-domain services)

### Agent Structure (`/agente`)
- `core/licenca.py` — License token validation against API (checked every 24h)
- `core/configuracao.py` — Fetches automation rules from API and caches them
- `core/agendador.py` — Task scheduling
- `automacoes/` — File actions: monitor folder (watchdog), move, rename, report
- `comunicacao/` — HTTP client for backend and event reporting
- `main.py` — Entry point: validates license, loads config, starts scheduler

### Database Schema (`/database/migrations`)
| Table | Key Design Notes |
|-------|-----------------|
| `clientes` | UUID PK, has `total_usuarios` counter maintained by trigger |
| `usuarios` | Weak entity; composite PK `(id, cliente_id)` |
| `licencas` | One per client; has `token`, `ativa`, `validade` |
| `regras` | Automation rules: `pasta_origem`, `pasta_destino`, `condicao`, `acao` |
| `eventos` | Activity log per client: `descricao`, `sucesso`, `timestamp` |

## Environment Variables

**Backend** (`.env`, not committed):
- `PORT=3001`
- `JWT_SECRET`
- Supabase connection credentials
- Stripe keys

**Frontend** (`.env.local`):
- `NEXT_PUBLIC_API_URL=http://localhost:3001`

**Agent** (`.env`):
- `API_URL`, `LICENSE_TOKEN`, `CLIENTE_ID`

## Language

All code comments, documentation, variable names, and user-facing strings are in **Portuguese**.

## Git Workflow

- `main` is protected; all changes via PR (João reviews)
- Feature branches follow the pattern `owner/feature` (e.g. `joao/backend`, `victor/login-page`)
