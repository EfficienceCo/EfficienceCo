# Demo Comercial Interativo — UI Kit

Single-file, self-contained HTML/CSS/vanilla-JS prototype for **sales meetings**.
Every automation shows badge **"Disponível"** (emerald) — this is the product
"as it will be when complete," not the real current build state. For the honest,
mixed-status version of the same screens, see [`../plataforma`](../plataforma)
(`Areas.jsx` / `AreasDetail.jsx`).

Replaces an earlier Claude Design canvas attempt, which produced static,
non-navigable artboards. This is a real hash-routed mini-app instead — the
seller clicks a card and a real sub-screen opens.

> Cosmetic recreation, not production code. Data is fictional (Escritório
> Pereira Contabilidade, 5 clients). Persona is `admin_cliente` only —
> no `admin_efficience` / internal-team screens.

## Run
Open `index.html` directly in a browser (no server, no build step). Login is
pre-filled — press **Entrar**.

## Coverage
- 8 nível-1 screens: Dashboard, Efficience/ROI, Obrigações, Processos, Logs,
  Regras, Usuários, Clientes.
- 6 área screens (Fiscal, Contábil, DP, Societário, Financeiro, Atendimento),
  39 automation cards total, all "Disponível".
- 39 automation detail screens: 4 bespoke (Escrituração NF-e, Conciliação
  bancária — with working Confirmar/Rejeitar, Folha de pagamento — with
  upload/status modals, Abertura de empresa — 10-step checklist), the other
  35 driven by 4 generic templates (tabela / resumo / progresso / log) so
  every card leads somewhere real instead of a dead end.

## Files
| File | Contents |
|---|---|
| `index.html` | Everything — tokens, components, data, router, all screens. |

Design tokens and component patterns (sidebar gradient, `.acard`, badges,
icon set) are copied verbatim from `../plataforma` / `../../colors_and_type.css`
to stay pixel-consistent with the rest of the design system.

## Source
[`projetos/efficience-co-demo-comercial-interativo.md`](../../../../efficience-vault/projetos/efficience-co-demo-comercial-interativo.md)
in the efficience-vault — full spec, screen list, and sales script.
