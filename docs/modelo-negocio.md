# Modelo de Negócio — EfficienceCo

> Atualizado em 2026-05-31.

---

## O que é a EfficienceCo

EfficienceCo é uma empresa de software fundada pelos quatro integrantes do time (João, Victor, Gabriel, Vinícius). Vende automação para escritórios administrativos — contábil, jurídico, RH, administração empresarial, entre outros.

**Modelo de produto:** a EfficienceCo desenvolve softwares-esqueleto por área administrativa. Quando um cliente contrata, o esqueleto da área correspondente é customizado, implantado e entregue como software dedicado para aquele cliente. Cada área tem seu próprio esqueleto — o esqueleto contábil é diferente do jurídico, que é diferente do de RH.

---

## Este Repositório

> ⚠️ **Leia antes de qualquer coisa.**

Este repositório **não é o sistema interno da EfficienceCo**. Não é o painel de gestão do time. Não é a plataforma da empresa. **É um produto feito pela EfficienceCo para um cliente externo.**

Analogia: uma agência de software que entrega um e-commerce para uma loja. O repositório do e-commerce pertence ao projeto da loja — não é o sistema interno da agência. Este repositório segue a mesma lógica.

**O cliente aqui é a Souza & Associados** — um escritório contábil fictício usado como piloto. Todo o código, todas as telas, todas as funcionalidades existem para resolver os problemas do escritório contábil, não para gerenciar a EfficienceCo.

Serve como:
1. MVP funcional para demonstrar valor ao primeiro cliente real
2. Template base para os próximos escritórios contábeis que a EfficienceCo fechar

---

## Modelo de Venda

- Cada cliente contratante recebe um software dedicado (fork + customização do esqueleto da área)
- O cliente paga licença recorrente (mensal ou anual — a definir) para continuar usando
- Se parar de pagar → software para de funcionar
- Cada cliente tem URL própria (ex: `souza.efficience.com.br`), backend e frontend independentes
- Banco de dados compartilhado (Supabase único), com isolamento por `cliente_id` via RLS

---

## Modelo Técnico — Agora vs Futuro

### Agora (fase de captação de clientes)
- Banco compartilhado (Supabase único com RLS por `cliente_id`) — desde o início
- Backend e frontend separados por cliente (deploy independente por escritório)
- Agente local (.exe) separado por cliente
- Próximo cliente = fork do repositório + customização + novo deploy + mesmo banco

### Futuro (após ter clientes reais pagando)
- Migrar backend e frontend para infraestrutura compartilhada
- Um único backend, subdomínios por cliente, banco já é compartilhado
- Muito mais barato de operar com escala

**Ponto de virada:** a partir do 3º–4º cliente, migrar para infra compartilhada começa a se pagar.

---

## Perfis de Acesso

| Perfil | Quem é | O que pode |
|---|---|---|
| `admin_efficience` | Qualquer membro do time EfficienceCo (João, Victor, Gabriel, Vinícius) | Acesso total — vê todos os clientes, todos os dados |
| `admin_cliente` | Admin do escritório contratante (ex: Roberto Souza, sócio da Souza & Associados) | Gerencia o próprio escritório — usuários, regras, dados do seu `cliente_id` |
| `funcionario` | Funcionário do escritório (Fernanda, Carlos, Patrícia...) | Acesso operacional — usa o painel, executa tarefas do dia a dia |

> **Atenção ao vocabulário:** "cliente" neste sistema significa o **escritório contábil que contrata a EfficienceCo** (ex: Souza & Associados). As empresas que o escritório atende (Padaria do João, MEI da Maria) **não existem como entidade no banco** — aparecem apenas como texto em processos e obrigações.

---

## Custos de Infraestrutura

### Modelo atual — banco compartilhado, backend/frontend separados

| Serviço | Custo |
|---|---|
| Vercel (frontend) | ~$0/cliente (free tier por projeto) |
| Railway (backend) | ~$5–10/cliente/mês |
| Supabase (banco) | **$25/mês fixo** — compartilhado entre todos os clientes |
| **Total estimado** | **~$5–10/cliente/mês + $25 fixo** |

Exemplos:
- 1 cliente → ~$30–35/mês
- 3 clientes → ~$40–55/mês
- 10 clientes → ~$75–125/mês

### Modelo futuro — infra compartilhada

| Serviço | Custo total/mês |
|---|---|
| Vercel Pro (todos os frontends) | ~$20 |
| Railway (um backend) | ~$10–15 |
| Supabase Pro | $25 |
| **Total fixo** | **~$55–60/mês independente do número de clientes** |

---

## Domínio
- 1 domínio `efficience.com.br` → ~R$80/ano (Registro.br)
- Subdomínios (`souza.efficience.com.br`) → gratuitos, criados via DNS
