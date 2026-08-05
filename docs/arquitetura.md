# EfficienceCo — Arquitetura e Estrutura do Repositório

> Atualizado em 2026-05-31.

---

## Visão geral

Sistema híbrido: frontend e backend na nuvem, agente Python rodando no PC do escritório.

```
Funcionários do escritório
       ↓
Frontend (Next.js) → souza.efficience.com.br
       ↓
Backend API (Node.js + Express) → Railway
       ↓
Banco de dados (PostgreSQL + Supabase)

       +

Agente local (Python .exe)
rodando no PC do escritório
       ↓ busca regras + reporta eventos
Backend API
```

---

## Estrutura do Repositório

```
efficience-co/
│
├── README.md
├── .gitignore
├── .env.example
│
├── docs/
│   ├── arquitetura.md            # Este arquivo — estrutura técnica + como rodar
│   ├── modelo-negocio.md         # O que é a EfficienceCo, este repositório e o modelo de venda
│   ├── especificacao-funcional.md # O que cada área do time deve implementar
│   ├── decisoes-tecnicas.md      # Por que escolhemos cada tecnologia
│   └── empresa-exemplo.md        # Souza & Associados — contexto de domínio e automações
│
├── backend/                      # João — Node.js + Express (ESM)
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── server.js
│       ├── app.js
│       ├── routes/
│       │   ├── auth.routes.js
│       │   ├── clientes.routes.js
│       │   ├── usuarios.routes.js
│       │   ├── regras.routes.js
│       │   ├── eventos.routes.js
│       │   ├── obrigacoes.routes.js
│       │   ├── processos.routes.js
│       │   └── notificacoes.routes.js
│       ├── controllers/
│       │   ├── auth.controller.js
│       │   ├── clientes.controller.js
│       │   ├── usuarios.controller.js
│       │   ├── regras.controller.js
│       │   ├── eventos.controller.js
│       │   ├── obrigacoes.controller.js
│       │   ├── processos.controller.js
│       │   └── notificacoes.controller.js
│       ├── middlewares/
│       │   ├── auth.middleware.js       # Valida JWT
│       │   └── permissao.middleware.js  # Controla acesso por perfil
│       ├── services/
│       │   ├── auth.service.js
│       │   └── notificacoes.service.js # Geração interna de notificações
│       └── config/
│           ├── database.js             # Supabase client (service_role)
│           └── perfis.js               # Constantes PERFIS.* (sem strings hardcoded)
│
├── frontend/                     # Victor — Next.js + Tailwind
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── .env.example
│   └── src/
│       ├── app/
│       │   ├── page.jsx               # Login
│       │   ├── layout.jsx
│       │   ├── dashboard/
│       │   │   ├── page.jsx           # Dashboard principal
│       │   │   ├── logs/page.jsx      # Logs do agente
│       │   │   ├── regras/page.jsx    # Regras de automação
│       │   │   ├── obrigacoes/page.jsx # Calendário fiscal
│       │   │   ├── processos/page.jsx  # Checklists
│       │   │   ├── comunicacao/page.jsx # Notificações
│       │   │   └── usuarios/page.jsx   # Usuários
│       │   └── admin/
│       │       ├── page.jsx
│       │       └── clientes/page.jsx
│       ├── components/
│       │   ├── ui/          # Button, Input, Modal, Table
│       │   ├── layout/      # Sidebar, Header
│       │   └── dashboard/   # LogCard, StatusLicenca
│       ├── hooks/
│       │   ├── useAuth.js
│       │   └── useApi.js
│       ├── services/
│       │   ├── api.js
│       │   ├── auth.service.js
│       │   ├── clientes.service.js
│       │   ├── regras.service.js
│       │   ├── eventos.service.js
│       │   ├── obrigacoes.service.js
│       │   ├── processos.service.js
│       │   └── notificacoes.service.js
│       └── context/
│           └── AuthContext.jsx
│
├── agente/                       # Gabriel — Python
│   ├── requirements.txt
│   ├── .env.example
│   ├── main.py
│   ├── core/
│   │   ├── configuracao.py       # Busca + cache de regras (polling de versão)
│   │   └── agendador.py          # Loop de sync + tarefas periódicas
│   ├── automacoes/
│   │   ├── monitorar_pasta.py    # Watchdog
│   │   ├── mover_arquivo.py      # Move com deduplicação de nome
│   │   ├── renomear_arquivo.py   # Padrão YYYYMMDD_HHMMSS_[nome]
│   │   └── gerar_relatorio.py    # CSV diário às 18h
│   ├── comunicacao/
│   │   ├── api_client.py         # HTTP client para o backend
│   │   └── reportar_evento.py    # Envia logs de execução
│   └── build/
│       └── build.sh              # Gera .exe com PyInstaller
│
└── database/                     # Vinícius — PostgreSQL + Supabase
    ├── README.md
    ├── migrations/
    │   ├── 001_criar_clientes.sql
    │   ├── 002_criar_usuarios.sql
    │   ├── 003_criar_licencas.sql
    │   ├── 004_criar_regras.sql
    │   ├── 005_criar_eventos.sql
    │   ├── 006_adicionar_atualizado_em_regras.sql
    │   ├── 007_criar_obrigacoes.sql    # ✅ 2026-05-16
    │   ├── 008_criar_processos.sql     # ✅ 2026-05-16 (tabelas processos + etapas)
    │   └── 009_criar_notificacoes.sql  # ✅ 2026-05-16
    └── seeds/
        ├── usuarios.sql               # ⚠️ vazio — seed documentado pendente
        ├── clientes.sql               # empresas do escritório (ex.: Padaria)
        ├── licencas.sql               # licença ativa para dev
        └── 001_regras_exemplo.sql     # 5 regras realistas
```

---

## Como rodar localmente

```bash
# Backend
cd backend && cp .env.example .env
npm install && npm run dev   # porta 3001

# Frontend
cd frontend && cp .env.example .env
npm install && npm run dev

# Agente
cd agente && cp .env.example .env
pip install -r requirements.txt
python main.py
```

---

## Regras de Git

- Nunca commitar direto na `main`
- Branches por membro: `joao/backend`, `gabriel/agente`, `vinicius/database`, `victor/frontend`
- Abrir PR para `main` quando funcionalidade estiver pronta
- João revisa todos os PRs
