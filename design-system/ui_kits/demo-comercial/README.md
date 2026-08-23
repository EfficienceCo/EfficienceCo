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

## Coverage — every automation is bespoke, on purpose

As of this round, **all 42 automations have a unique, hand-built interface** —
no shared interaction template of any kind. Each one's composition (what
element is unique, what a button does, what state a "processing" action
resolves into) comes straight from that automation's own ficha in
`efficience-vault/automacoes/*.md`, section **"Especificação de interface
(experiência única desta automação)"**. Two prior rounds tried a single
generic layout and then 6 shared interaction patterns — both were explicitly
rejected in favor of this one: every screen decides its own shape.

- 8 nível-1 screens: Dashboard, Efficience/ROI, Obrigações, Processos, Logs,
  Regras, Usuários, Clientes.
- 6 área screens (Fiscal, Contábil, DP, Societário, Financeiro, Atendimento),
  **42 automation cards** total, all "Disponível" — 3 added this round
  (Admissão de Funcionário, Regularização Cadastral, Onboarding de Clientes)
  to reach full coverage of the 38-ficha catalog; they didn't exist in the
  demo before.
- **42 unique detail screens**, each with real client-side state
  (`STATE.exec[automationId]`, persisted in memory for the browser session —
  survives navigating away and back, resets on logout) and, where the ficha
  calls for a simulated action, a real "processing" phase (spinner, ~1-1.5s
  `setTimeout`) before settling into a different terminal state. A sample of
  what makes each one distinct — not an exhaustive list:
  - **Escrituração NF-e** — "Simular chegada de nova nota" plays a live
    inbox: Detectando → Lendo XML → resolved row with a fade-in highlight,
    CFOP-incomum rows get an orange left border + alert tooltip.
  - **eSocial** — 3-step wizard (event-type cards → live-validated form,
    CPF/date errors shown before submit → side preview panel → Transmitir
    gives a recibo number).
  - **Apuração Simples Nacional** — clicking the alíquota efetiva expands
    the real formula with the client's own numbers plugged in.
  - **Classificação NCM/CFOP** — confidence gauge per row (battery-style),
    "Corrigir manualmente" opens a simulated-autocomplete search.
  - **SPED Fiscal** — discrete 3-phase stepper (Gerando/Validando/Transmitido)
    per client, not a continuous progress bar; clicking a client plays a
    live validation log before advancing.
  - **Certificado digital** — countdown ring gauge (not a bar) per client;
    renewal checklist branches by certificate type (A1 vs. A3, the latter
    gets an extra "agendar comparecimento presencial" date step).
  - **Conciliação de contas contábeis** — a literal visual bridge between
    the "saldo contábil" and "saldo auxiliar" columns: straight/green when
    they match, broken/red when they diverge.
  - **Reajuste de honorários** — inline-editable grid; any cell edited by
    hand gets a lock dot and survives switching the global índice chip.
  - **Baixa de empresa** — the final checklist step alone gets a dark,
    grave-toned confirm box ("não pode ser desfeita"), unlike every other
    green/festive completion state in the demo.
  - **Admissão de funcionário** (new) — 4 parallel document upload slots
    side by side; "Concluir Admissão" is gated on two independent
    conditions at once (slots *and* form validity).
  - **Onboarding de clientes** (new) — a "Ver como o cliente vê" toggle
    swaps the same screen between the internal checklist and the
    simplified client-facing progress view, in place.
  - **Regularização cadastral** (new) — deliberately *not* a checklist: one
    dropdown reveals one field, confirm — 3 clicks total, on purpose lighter
    than every other Societário screen.

  The remaining screens each have their own equally specific element —
  see the ficha's "Especificação de interface" section for the one you're
  curious about, or just click through the demo.

- Small, genuinely generic atoms are reused across screens where that's just
  good engineering, not a pattern: `sp()` (spinner), `ring()` (circular
  gauge), `mgauge()` (mini horizontal gauge), `stepper3()` (3-phase stepper),
  `badge()`, `table()`. Composition and interaction logic are never shared.

## Files
| File | Contents |
|---|---|
| `index.html` | Shell only — `<head>` fonts/stylesheet link, `#app` mount point, `<script src>` for `data.js` then `app.js`. |
| `styles.css` | Design tokens (`design-system/colors_and_type.css`), shell components (sidebar, cards, badges, tables, modal), and one CSS block per bespoke screen family (rings, steppers, gauges, diffs, timelines, carousels, document slots, A4 preview, etc.) — grouped and commented by automation. |
| `data.js` | `CLIENTES`, nav config, `TITLES`/`AREA_LABEL`/`AREA_SUB`, and the `AUTOMACOES` catalog (42 entries: id/area/icon/name/description only — every automation is `tipo:'bespoke'`, so its actual data and state live next to its render function in `app.js`). Must load before `app.js`. |
| `app.js` | Icon set, tiny shared UI atoms, `STATE.exec` (per-automation state store), one seed-data + `render*()` + `bind*()` trio per automation (42 of them, grouped by area with a comment header), the router (`BESPOKE` / `BESPOKE_BIND` maps), and the nível-1 screens. |

Design tokens and component patterns (sidebar gradient, `.acard`, badges,
icon set) originate from `../plataforma` / `../../colors_and_type.css` to
stay pixel-consistent with the rest of the design system.

## Source
- [`automacoes/efficience-co-automacoes-indice.md`](../../../../efficience-vault/automacoes/efficience-co-automacoes-indice.md)
  in the efficience-vault — the 38-ficha catalog (fixed 5-client dataset,
  badge convention).
- Each ficha's own **"Especificação de interface (experiência única desta
  automação)"** section — the actual source of truth for every screen's
  unique composition and interaction in this round.
- [`projetos/efficience-co-demo-comercial-interativo.md`](../../../../efficience-vault/projetos/efficience-co-demo-comercial-interativo.md)
  — original spec, screen list, and sales script.
