# EfficienceCo — Modelo de Negócio

> Atualizado em 2026-05-08.

---

## O que é a EfficienceCo

Empresa de software que cria sistemas de automação para **qualquer área administrativa** — escritório contábil, jurídico, RH de montadora, administrativo de qualquer empresa. O produto automatiza processos manuais que essas áreas fazem hoje em planilha, WhatsApp e papel.

O primeiro nicho sendo trabalhado é o escritório contábil (empresa exemplo: Souza & Associados).

---

## Modelo de Venda

- EfficienceCo entrega um software dedicado para cada cliente contratante
- O cliente paga uma **licença recorrente** (mensal ou anual — a definir) para continuar usando
- Se parar de pagar → software para de funcionar
- Cada cliente tem seu próprio sistema, URL própria (ex: `souza.efficience.com.br`), dados completamente separados

---

## Modelo Técnico — Agora vs Futuro

### Agora (fase de captação de clientes)
- Um repositório independente por cliente
- Deploy separado por cliente
- Próximo cliente = fork deste repositório + adaptações

### Futuro (após ter clientes reais pagando)
- Migrar para infraestrutura compartilhada
- Um backend, um banco com isolamento por cliente, subdomínios
- Muito mais barato de operar com escala

---

## Este Repositório

Este código é o **software da Souza & Associados**. Não é um produto final genérico — é:
1. O exemplo funcional para mostrar ao primeiro cliente real
2. O template base para os próximos clientes

Não contém: sistema de licença, Stripe, painel de gestão da Efficience. Esses elementos fazem parte do modelo de negócio futuro, não do piloto atual.

---

## Custos de Infraestrutura

### Modelo atual — deploy separado por cliente

| Serviço | Custo por cliente/mês |
|---|---|
| Vercel (frontend) | ~$0 (free tier) |
| Railway (backend) | ~$5–10 |
| Supabase (banco) | $0 nos 2 primeiros, **$25 cada depois** |
| **Total estimado** | **~$30–35/cliente/mês** |

### Modelo futuro — infraestrutura compartilhada

| Serviço | Custo total/mês |
|---|---|
| Vercel Pro | ~$20 |
| Railway | ~$10–15 |
| Supabase Pro | $25 |
| **Total fixo** | **~$55–60/mês para qualquer número de clientes** |

### Ponto de virada

| Clientes | Separado | Compartilhado |
|---|---|---|
| 1–2 | ~$0–35/mês | ~$55/mês |
| 3 | ~$60–80/mês | ~$55/mês |
| 5 | ~$130–160/mês | ~$55/mês |
| 10 | ~$300–350/mês | ~$55/mês |

**Conclusão:** a partir do 3º cliente, migrar para infraestrutura compartilhada se paga.

### Domínio
- 1 domínio `efficience.com.br` → ~R$80/ano (Registro.br)
- Subdomínios gratuitos, criados via DNS
