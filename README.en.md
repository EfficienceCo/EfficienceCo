# Efficience Co

> 🇧🇷 Versão em português: [README.md](README.md)

> Custom software for offices. Less rework, more results.

---

## 📌 About the project

**Efficience Co** builds custom systems for accounting, administrative and
management offices — automating manual processes, eliminating rework and
improving operational efficiency end to end.

The model is simple: we come into the office, map how everything works, and
deliver software that solves the real day-to-day bottlenecks. We charge a monthly
fee for the license and ongoing maintenance.

---

## 🗂️ Repository structure

```
efficience-co/
│
├── README.md
├── .gitignore
├── .env.example
├── setup.py                        # Generates the whole project structure automatically
│
├── docs/                           # General documentation
│   ├── arquitetura.md
│   ├── divisao-time.md
│   ├── especificacao-funcional.md
│   └── decisoes-tecnicas.md
│
├── backend/                        # João — API + Payments (Node.js + Express)
│   ├── src/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── middlewares/
│   │   ├── services/
│   │   └── config/
│   └── tests/
│
├── frontend/                       # Victor — Interface (React + Next.js)
│   └── src/
│       ├── app/
│       ├── components/
│       ├── hooks/
│       ├── services/
│       └── context/
│
├── agente/                         # Gabriel — Local agent (Python)
│   ├── core/
│   ├── automacoes/
│   ├── comunicacao/
│   └── build/
│
└── database/                       # Vinícius — Database (PostgreSQL + Supabase)
    ├── migrations/
    └── seeds/
```

---

## 🛠️ Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + Next.js |
| Backend / API | Node.js + Express |
| Database | PostgreSQL via Supabase |
| Local agent | Python |
| Payments / Licensing | Stripe |
| Frontend deploy | Vercel |
| Backend deploy | Railway |

---

## 👥 Team

| Who | Area | Technology |
|---|---|---|
| João | Backend + Licensing + Payments | Node.js + Express + Stripe |
| Gabriel | Local agent | Python |
| Vinícius | Database | PostgreSQL + Supabase |
| Victor | Frontend | React + Next.js |

---

## 🏗️ Architecture

The system is hybrid: part runs in the cloud, part runs on the client's machine.

```
[Victor — Frontend]
        ↓ HTTP requests (JWT)
[João — Backend + API]
        ↓ SQL queries
[Vinícius — Database]

[Gabriel — Local agent]
        ↓ validates license + fetches rules + reports events
[João — Backend + API]
        ↓ reads/writes
[Vinícius — Database]
```

- **Frontend + Backend** — hosted in the cloud (Vercel + Railway)
- **Local agent** — installed on the client's machine, runs in the background,
  no interface
- **Licensing** — the agent validates its token against the API every 24h. If a
  payment fails, the license is deactivated automatically and the agent stops
  working.

---

## 🚀 Running locally

```bash
# 1. Clone the repository
git clone https://github.com/EfficienceCo/EfficienceCo.git
cd EfficienceCo

# 2. Generate the file structure (first time only)
python setup.py

# 3. Backend
cd backend
cp .env.example .env
npm install
npm run dev

# 4. Frontend
cd ../frontend
cp .env.example .env
npm install
npm run dev

# 5. Local agent
cd ../agente
cp .env.example .env
pip install -r requirements.txt
python main.py
```

---

## 📋 Workflow

1. **Mapping** — Process discovery with the client
2. **Functional documentation** — What the system must do
3. **Prototyping** — Flows and screens in Figma
4. **Development** — Iterative sprints with partial deliveries
5. **Homologation** — Validation with the client before deploy
6. **Deploy & Maintenance** — Ship to production + ongoing support

---

## 🌿 Git rules

- Never commit directly to `main`
- Each member works on their own branch:
  - `joao/backend`
  - `gabriel/agente`
  - `vinicius/database`
  - `victor/frontend`
- Open a Pull Request to `main` when a feature is ready
- João reviews every PR before approving

---

## 🔒 Security & compliance

- Data handled in line with the Brazilian data protection law (**LGPD**)
- JWT authentication with per-role permission control
- Automatic backups configured via Supabase
- Sensitive variables never committed (use `.env`)
- Row Level Security (RLS) in the database — each client only accesses its own
  data

---

## 📄 License

Private repository. All rights reserved © Efficience Co.
