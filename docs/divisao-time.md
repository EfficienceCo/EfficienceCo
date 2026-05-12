# EfficienceCo — Divisão do Time

> Atualizado em 2026-05-08.

---

## João — Backend + API
**Tecnologias:** Node.js + Express

Responsável pelo cérebro do sistema. Toda comunicação entre frontend, banco de dados e agente local passa aqui. Cuida da autenticação, das regras de negócio e de todas as rotas da API.

**Áreas de responsabilidade:**
- Auth (JWT + RBAC)
- CRUD de clientes contábeis e usuários
- API de regras de automação (para o agente)
- API de obrigações fiscais e calendário
- API de processos e checklists
- API de notificações
- Logs e eventos do agente

---

## Gabriel — Agente Local
**Tecnologia:** Python

Responsável pelo processo que roda no PC do escritório. Monitoramento de pastas, execução de automações, sync de regras com a API do João.

**Áreas de responsabilidade:**
- Monitoramento de pastas em tempo real (watchdog)
- Mover, renomear e organizar arquivos por regra
- Sync inteligente de regras (cache + polling de versão)
- Relatório diário de atividades
- Estrutura de pastas para abertura de empresa
- Comunicação com backend (reportar eventos)

---

## Vinícius — Banco de Dados
**Tecnologias:** PostgreSQL + Supabase

Responsável pela modelagem das tabelas, migrations e seeds. Trabalha alinhado com o João — o backend depende diretamente do que for modelado aqui.

**Áreas de responsabilidade:**
- Migrations versionadas (001 em diante)
- Seeds de desenvolvimento completos
- RLS e configuração de service_role
- Tabelas: usuarios, clientes, regras, eventos, obrigacoes, processos, etapas_processo, notificacoes

---

## Victor — Frontend
**Tecnologias:** React + Next.js + Tailwind CSS

Responsável pelas telas que o contador vai usar no dia a dia. Consome a API do João.

**Áreas de responsabilidade:**
- Dashboard principal com resumo operacional
- Painel de obrigações e calendário fiscal
- Painel de processos e checklists
- Central de notificações
- Gestão de regras de automação
- Gestão de usuários e clientes

---

> **Atenção:** João e Vinícius precisam alinhar a modelagem das novas tabelas (obrigacoes, processos, etapas_processo, notificacoes) antes de qualquer um avançar nessas áreas.
