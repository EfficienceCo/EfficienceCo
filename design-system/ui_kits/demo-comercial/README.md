# Demo Comercial Interativo — UI Kit

Self-contained HTML/CSS/vanilla-JS prototype for **sales meetings**, split
across 4 files (no build step). Every automation shows badge **"Disponível"**
(emerald) — this is the product "as it will be when complete," not the real
current build state. For the honest, mixed-status version of the same
screens, see [`../plataforma`](../plataforma) (`Areas.jsx` / `AreasDetail.jsx`).

Replaces an earlier Claude Design canvas attempt, which produced static,
non-navigable artboards. This is a real hash-routed mini-app instead — the
seller clicks a card and a real sub-screen opens.

> Cosmetic recreation, not production code. Data is fictional (Escritório
> Pereira Contabilidade, 5 clients). Persona is `admin_cliente` only —
> no `admin_efficience` / internal-team screens.

## Run
Open `index.html` directly in a browser (no server, no build step). It loads
`styles.css`, `data.js` and `app.js` via plain `<link>`/`<script src>` — these
work over `file://`, so double-click still works. (Only `fetch`/`XHR` would
break under `file://`; none are used here.) Login is pre-filled — press
**Entrar**.

## Coverage
- 8 nível-1 screens: Dashboard, Efficience/ROI, Obrigações, Processos, Logs,
  Regras, Usuários, Clientes.
- 6 área screens (Fiscal, Contábil, DP, Societário, Financeiro, Atendimento),
  39 automation cards total, all "Disponível".
- 39 automation detail screens: **7 bespoke** — Escrituração NF-e, Conciliação
  bancária (working Confirmar/Rejeitar), Folha de pagamento (upload/status
  modals), Abertura de empresa (10-step checklist), and 3 promoted in this
  round for commercial weight: **eSocial** (validated-form mock + event
  timeline with recibo numbers), **Emissão de Guias DAS/DARF** (boleto-style
  cards with barcode, grouped by client, totals footer) and **Cobrança de
  Documentação Pendente** (cliente × documento status matrix, matching the
  UX described in its ficha instead of a flat log feed). The other **32**
  are driven by the 4 generic templates (tabela / resumo / progresso / log),
  each enriched with copy pulled from its ficha in `efficience-vault/automacoes/`
  plus one extra visual element: a `nota` chip explaining a technical term,
  a totals footer summing a money column, or an automatic summary bar/chip
  row computed from the template's own rows (progresso: done/total + average
  %; log: counts by tipo).

## Files
| File | Contents |
|---|---|
| `index.html` | Shell only — `<head>` fonts/stylesheet link, `#app` mount point, `<script src>` for `data.js` then `app.js`. |
| `styles.css` | Design tokens (`design-system/colors_and_type.css`), all components (sidebar, cards, badges, tables, forms, modal), plus the enrichment classes (`.note-chip`, `.totals-footer`, `.summary-bar`, `.chip-row`) and the 3 new bespoke screens (`.form-mock`, `.esoc-*`, `.guia-*`, `.matrix*`). |
| `data.js` | `CLIENTES`, nav config, `TITLES`/`AREA_LABEL`/`AREA_SUB`, and the `AUTOMACOES` array (39 entries, copy sourced from the fichas). Must load before `app.js`. |
| `app.js` | Icon set, render helpers, the 4 generic detail templates (now enrichment-aware), all 7 bespoke screens, the router, and event bindings. |

Design tokens and component patterns (sidebar gradient, `.acard`, badges,
icon set) originate from `../plataforma` / `../../colors_and_type.css` to
stay pixel-consistent with the rest of the design system.

## Source
- [`automacoes/efficience-co-automacoes-indice.md`](../../../../efficience-vault/automacoes/efficience-co-automacoes-indice.md)
  in the efficience-vault — the 38-ficha catalog this round's copy and specs
  were sourced from (fixed 5-client dataset, 4 generic templates, badge
  convention).
- [`projetos/efficience-co-demo-comercial-interativo.md`](../../../../efficience-vault/projetos/efficience-co-demo-comercial-interativo.md)
  — original spec, screen list, and sales script.
