# Efficience Co — Divisão do Time

## João — Backend + Pagamento
**Tecnologias:** Node.js + Express + Stripe

Responsável pelo cérebro do sistema. Todas as requisições do frontend e do agente local passam por aqui. Cuida também da lógica de licença e integração com o Stripe.

---

## Gabriel — Agente Local
**Tecnologia:** Python

Responsável pelo processo que roda na máquina do cliente. Monitoramento de pastas, execução de automações, validação de token com a API do João.

---

## Vinícius — Banco de Dados
**Tecnologias:** PostgreSQL + Supabase

Responsável pela modelagem das tabelas, relacionamentos e queries. Trabalha alinhado com o João, já que o backend depende diretamente do que for modelado aqui.

---

## Victor — Frontend
**Tecnologias:** React + Next.js

Responsável pelas telas que o funcionário do escritório vai usar no dia a dia. Consome a API do João.

---

> **Atenção:** João e Vinícius precisam alinhar a modelagem do banco antes de qualquer um começar a codar. Essa é a primeira tarefa conjunta do time.