# EfficienceCo — Modelo de Negócio

> Atualizado em 2026-05-31.

---

## O que é a EfficienceCo

Empresa de software que cria sistemas de automação para **qualquer área administrativa** — escritório contábil, jurídico, RH de montadora, administrativo de qualquer empresa. O produto automatiza processos manuais que essas áreas fazem hoje em planilha, WhatsApp e papel.

O primeiro nicho sendo trabalhado é o escritório contábil (empresa exemplo: Souza & Associados).

---

## Modelo de Venda

- EfficienceCo entrega um software dedicado para cada cliente contratante
- O cliente paga uma **licença recorrente** (mensal ou anual — a definir) para continuar usando
- Se parar de pagar → software para de funcionar
- Cada cliente tem sua própria URL (ex: `souza.efficience.com.br`), backend e frontend dedicados
- Banco de dados compartilhado (Supabase único), com isolamento por `cliente_id` via RLS

---

## Modelo Técnico — Agora vs Futuro

### Agora (fase de captação de clientes)
- Banco compartilhado (Supabase único com RLS por `cliente_id`) — desde o início
- Backend e frontend separados por cliente (deploy independente por escritório)
- Agente local (.exe) separado por cliente
- Próximo cliente = fork do backend/frontend + novo deploy + mesmo banco

### Futuro (após ter clientes reais pagando)
- Migrar backend e frontend para infraestrutura compartilhada também
- Um único backend, subdomínios por cliente, banco já é compartilhado
- Muito mais barato de operar com escala

---

## Este Repositório

Este código é o **software da Souza & Associados**. Não é um produto final genérico — é:
1. O exemplo funcional para mostrar ao primeiro cliente real
2. O template base para os próximos clientes

Não contém: sistema de licença, Stripe, painel de gestão da Efficience. Esses elementos fazem parte do modelo de negócio futuro, não do piloto atual.

---

## Custos de Infraestrutura

### Modelo atual — banco compartilhado, backend/frontend separados

| Serviço | Custo |
|---|---|
| Vercel (frontend) | ~$0/cliente (free tier por projeto) |
| Railway (backend) | ~$5–10/cliente/mês |
| Supabase (banco) | **$25/mês fixo** — compartilhado entre todos os clientes |
| **Total estimado** | **~$5–10/cliente/mês + $25 fixo** |

Exemplos reais:
- 1 cliente → ~$30–35/mês
- 3 clientes → ~$40–55/mês
- 5 clientes → ~$50–75/mês
- 10 clientes → ~$75–125/mês

### Modelo futuro — backend e frontend também compartilhados

| Serviço | Custo total/mês |
|---|---|
| Vercel Pro (todos os frontends) | ~$20 |
| Railway (um backend) | ~$10–15 |
| Supabase Pro (já compartilhado) | $25 |
| **Total fixo** | **~$55–60/mês independente do número de clientes** |

### Ponto de virada

A partir do 3º–4º cliente, migrar o backend/frontend para infra compartilhada começa a se pagar.

### Domínio
- 1 domínio `efficience.com.br` → ~R$80/ano (Registro.br)
- Subdomínios gratuitos, criados via DNS
