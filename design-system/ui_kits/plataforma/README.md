# Plataforma — UI Kit

High-fidelity, interactive recreation of the **Efficience Co platform** — the
authenticated product that an accounting office's team uses day to day. Efficience
ships a **separate software per client (office)**; they all share this design
language, only the features change. This kit is the **reference UX for the office
employee** (the `funcionário` / `admin_cliente` experience), plus the Efficience
support area.

Built on the real `frontend/` source (React + Next.js + Tailwind) in
`EfficienceCo/EfficienceCo`, re-expressed on the design-system tokens.

> Cosmetic recreation, not production code. State is faked (in-memory); navigation,
> filtering, modals, toggles, checklists and pagination are real and interactive.

## Run
Open `index.html`. Login is pre-filled — press **Entrar**. Navigate via the dark
sidebar. The bell (top-right) jumps to the Notifications center; its dot reflects
unread count.

## Screen map (MVP)
| Area | Screens / interactions |
|---|---|
| **Login** | Dark glass card, e-mail + senha. |
| **Dashboard** | Day cockpit: next critical deadline (countdown), KPIs, obligations calendar, agent activity, processes, agent event log. |
| **Efficience / ROI** | Period pills (7/15/30 dias), horas economizadas / execuções / R$ equivalente KPIs, breakdown table por automação, cartão de licença com "Pagar licença". |
| **Fiscal · Contábil · DP · Societário · Financeiro · Atendimento** | The six área screens — grid of `AutomacaoCard` (ícone, nome, descrição, badge de status). **Status is real**, not a sales demo: most cards are `Planejado` (locked, "Em breve"), a couple are `Em desenvolvimento`, and only the automations with a real route (Escrituração NF-e, Conciliação bancária, Folha mensal) are `Disponível` and clickable. |
| **Fiscal → Escrituração NF-e** | KPI cards (NFes, valor, ICMS, PIS+COFINS) + lançamentos table. |
| **Contábil → Conciliação bancária** | Lançamentos internos table + **novo lançamento** modal · extrato bancário card · sessões de conciliação table → **detalhe** modal with automático/provável (confirmar/rejeitar, real state) /sem-par sections. |
| **DP → Folha de pagamento mensal** | Two option cards (upload / status) → **status** modal (per-client checklist + progress) and **upload** modal (drop zone stub → success state). |
| **Obrigações** | List w/ filters (mês, cliente, status chips) · **Calendar** tab · **Nova/editar** modal (nome, tipo, data, recorrência, cliente) · **Concluir** modal with comprovante upload. |
| **Processos** | List w/ progress bars + filters · **Detail** with checkbox checklist (who did what, % progress), documents, linked automation · **Novo processo** modal · **Abertura de empresa** form (empresa, sócios, CNAE, endereço, regime). |
| **Regras** | List with per-row **toggle** (ativar/desativar), origem→destino, ação · **Nova/editar regra** modal (pasta origem, destino, condição, ação, cliente). |
| **Logs do agente** | Event history (sucesso / erro / info) · filter chips + date range · **pagination**. |
| **Notificações** | Center with unread highlight, mark-one / mark-all read · header badge on every screen. |
| **Clientes** *(admin_cliente)* | The businesses the office serves — list + **CRUD** modal + activate/deactivate. |
| **Usuários** *(admin_cliente)* | Office team — list + **CRUD** modal (perfil admin/funcionário, senha) + remove confirm. |
| **Escritórios** *(admin_efficience)* | Efficience's own admin: offices, license status, support access + **CRUD** modal. |

## Files
| File | Contents |
|---|---|
| `index.html` | Entry point; loads React + Babel + the kit scripts in order. |
| `styles.css` | Shell, dark sidebar, topbar, cockpit, cards, tables, badges, login, `.grid3`/`.acard` (automation cards). |
| `screens.css` | Screen components: toolbars/filters, modals, forms, toggles, checklists, progress, upload, pagination, page tabs, detail, notifications. |
| `Icons.jsx` | Line-icon set (1.8 stroke, 24px grid) — exported to `window`. Includes the área-nav icons and the 23-icon automation set (`IcoAut*`), mirrored from `frontend/src/components/icons/AutomacaoIcons.jsx`. |
| `ui.jsx` | Shared primitives: `Modal`, `Field`, `Input`, `Select`, `SegRadio`, `Toggle`, `PageTabs`, `Search`, `Dropdown`, `FilterChips`, `Pager`, `Progress`, `Badge`, `Avatar`, `EmptyState`, `PageHead`. |
| `Chrome.jsx` | `Logo`, `Sidebar` (with live agent card, now grouped: Home/Logs/Efficience → Áreas de automação → Operacional → Gestão → Efficience suporte), `Topbar`. |
| `Dashboard.jsx` | `DashboardPage` + cockpit widgets. |
| `Efficience.jsx` | `EfficiencePage` — ROI screen. |
| `Areas.jsx` | `AutomacaoCard` + the six área list pages (`FiscalPage`, `ContabilPage`, `DpPage`, `SocietarioPage`, `FinanceiroPage`, `AtendimentoPage`), seeded from the real `AUTOMACOES` arrays in `frontend/src/app/dashboard/<area>/page.jsx`. |
| `AreasDetail.jsx` | The three "Disponível" detail screens: `FiscalEscrituracaoPage`, `ContabilConciliacaoPage`, `DpFolhaPage`. |
| `Obrigacoes.jsx` | List, calendar, create/edit + complete-with-upload modals. |
| `Processos.jsx` | List, detail checklist, create + abertura-de-empresa forms. |
| `Regras.jsx` | List with toggles + rule form. |
| `Logs.jsx` | Paginated agent log. |
| `Notificacoes.jsx` | Notifications center + `useNotifs` store. |
| `Pessoas.jsx` | `UsuariosPage`, `ClientesPage`, `EscritoriosPage` + their forms. |
| `App.jsx` | Login + router + shell wiring; mounts to `#root`. |

## Architecture notes
- Each `<script type="text/babel">` has its own scope; shared components are
  published to `window` via `Object.assign` at the end of each file (the same
  pattern used for icons). Load order in `index.html` matters.
- Data is seeded in-memory per module; interactions (toggle, complete, mark-read,
  checklist, paginate, filter) mutate local React state so the kit feels live.
- Copy is authentic pt-BR domain language (obrigações, vencimento, em atraso,
  regime, sócios, CNAE, licença). Sentence case, no emoji.

## Fidelity notes
- Light app + dark login both reproduced; neutrals unified on **slate**.
- "Clientes" = the businesses the office serves (Padaria do João, MEIs…).
  "Escritórios" = the accounting offices that are Efficience's own customers.
- The área screens intentionally show the **real, mixed build state** (mostly
  `Planejado`, a few `Em desenvolvimento`, three `Disponível`) — this kit documents
  the actual product, unlike a sales-demo canvas that would show everything as
  shipped. If you need the "product as it will be" version for a pitch deck, that's
  a different artifact, not this kit.
