# Efficience Co

> Software sob medida para escritórios. Menos retrabalho, mais resultado.

---

## 📌 Sobre o Projeto

A **Efficience Co** desenvolve sistemas personalizados para escritórios de contabilidade, administração e gestão — automatizando processos manuais, eliminando retrabalho e aumentando a eficiência operacional de ponta a ponta.

O modelo é simples: entramos no escritório, mapeamos como tudo funciona, e entregamos um software que resolve os gargalos reais do dia a dia. Cobramos uma mensalidade pela licença e manutenção contínua.

---

## 🗂️ Estrutura do Repositório

```
efficience-co/
│
├── README.md
├── .gitignore
├── .env.example
├── setup.py                        # Gera toda a estrutura do projeto automaticamente
│
├── docs/                           # Documentação geral
│   ├── arquitetura.md
│   ├── divisao-time.md
│   ├── especificacao-funcional.md
│   └── decisoes-tecnicas.md
│
├── backend/                        # João — API + Pagamento (Node.js + Express)
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
├── agente/                         # Gabriel — Agente local (Python)
│   ├── core/
│   ├── automacoes/
│   ├── comunicacao/
│   └── build/
│
└── database/                       # Vinícius — Banco de dados (PostgreSQL + Supabase)
    ├── migrations/
    └── seeds/
```

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React + Next.js |
| Backend / API | Node.js + Express |
| Banco de dados | PostgreSQL via Supabase |
| Agente local | Python |
| Pagamento / Licença | Stripe |
| Deploy frontend | Vercel |
| Deploy backend | Railway |

---

## 👥 Time

| Quem | Área | Tecnologia |
|---|---|---|
| João | Backend + Licença + Pagamento | Node.js + Express + Stripe |
| Gabriel | Agente local | Python |
| Vinícius | Banco de dados | PostgreSQL + Supabase |
| Victor | Frontend | React + Next.js |

---

## 🏗️ Arquitetura

O sistema é híbrido: parte roda na nuvem, parte roda na máquina do cliente.

```
[Victor — Frontend]
        ↓ requisições HTTP (JWT)
[João — Backend + API]
        ↓ queries SQL
[Vinícius — Banco de dados]

[Gabriel — Agente local]
        ↓ valida licença + busca regras + reporta eventos
[João — Backend + API]
        ↓ lê/salva
[Vinícius — Banco de dados]
```

- **Frontend + Backend** — hospedados na nuvem (Vercel + Railway)
- **Agente local** — instalado na máquina do cliente, roda em segundo plano, sem interface
- **Licença** — o agente valida o token na API a cada 24h. Se o pagamento falhar, a licença é desativada automaticamente e o agente para de funcionar

---

## 🚀 Como Rodar Localmente

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/efficience-co.git
cd efficience-co

# 2. Gere a estrutura de arquivos (apenas na primeira vez)
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

# 5. Agente local
cd ../agente
cp .env.example .env
pip install -r requirements.txt
python main.py
```

---

## 📋 Fluxo de Trabalho

1. **Mapeamento** — Levantamento de processos com o cliente
2. **Documentação funcional** — O que o sistema deve fazer
3. **Prototipação** — Fluxos e telas no Figma
4. **Desenvolvimento** — Sprints iterativas com entregas parciais
5. **Homologação** — Validação com o cliente antes do deploy
6. **Deploy & Manutenção** — Entrega em produção + suporte contínuo

---

## 🌿 Regras de Git

- Nunca commitar direto na branch `main`
- Cada membro trabalha na própria branch:
  - `joao/backend`
  - `gabriel/agente`
  - `vinicius/database`
  - `victor/frontend`
- Abrir Pull Request pra `main` quando uma funcionalidade estiver pronta
- João revisa todos os PRs antes de aprovar

---

## 🔒 Segurança & Compliance

- Dados tratados conforme a **LGPD**
- Autenticação via JWT com controle de permissões por perfil
- Backups automáticos configurados via Supabase
- Variáveis sensíveis nunca versionadas (usar `.env`)
- Row Level Security (RLS) no banco — cada cliente só acessa os próprios dados

---

## 📄 Licença

Repositório privado. Todos os direitos reservados © Efficience Co.

## Como rodar o Agente
- caso não tenha instalado rodar o comando
pip install -r requirements.txt
- Na pasta do backend rodar o comando 
npm run dev
- run no arquivo python main.py

