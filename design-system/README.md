# Efficience Co — Design System

> **Software sob medida para escritórios. Menos retrabalho, mais resultado.**
> _(Custom-built software for back-offices. Less rework, more results.)_

This repository is the brand + product design system for **Efficience Co**, a
Brazilian B2B software studio. It contains the visual foundations (color, type,
spacing, elevation), brand assets (logo, iconography), reusable UI-kit components
that recreate the product, and writing/tone guidance — everything a design agent
needs to produce on-brand interfaces, marketing, and decks.

> ⚠️ **Early-stage note.** Efficience Co is still being defined — there was no
> logo, marketing site, or formal design language when this system was created.
> The codebase shipped a working product UI (the dashboard) with a clear de-facto
> palette and component grammar; everything else here (logo, type system,
> marketing surfaces) is a **proposed direction built as inspiration**. Treat it
> as a strong v0 to react to, not a locked spec.

---

## 🚨 Erro crítico de modelo — leia antes de usar os ui_kits

**Este design system foi construído com um entendimento errado de quem são os usuários do produto.**

O agente que gerou as telas em `ui_kits/plataforma/` tratou a plataforma como um produto **genérico para o time da Efficience Co e para os clientes ao mesmo tempo** — misturando os dois públicos numa única visão de produto. Isso está **errado**.

### Como o produto realmente funciona

```
Efficience Co (nós)
  └── atende → Escritórios contábeis/administrativos  ← esses são os "clientes" no banco
                    └── usam a plataforma para gerenciar → Empresas do escritório
```

Existem **três perfis distintos**, com telas e permissões completamente separadas:

| Perfil | Quem é | O que acessa |
|---|---|---|
| `admin_efficience` | Time interno da Efficience Co | Painel admin: gerencia quais escritórios têm licença ativa, cria/desativa clientes, não vê os dados operacionais do escritório |
| `admin_cliente` | Dono/gestor do escritório contratante | Dashboard completo do escritório: obrigações, processos, regras de automação, usuários do próprio escritório |
| `funcionario_cliente` | Colaborador do escritório | Dashboard do escritório com permissões reduzidas (sem gerenciar usuários/regras) |

### O que ficou misturado nas telas geradas

As telas em `ui_kits/plataforma/` mesclam indiscriminadamente elementos do painel admin (que só o time da Efficience vê) com o dashboard operacional (que o escritório usa). O resultado é um produto que não existe: uma interface única servindo a donos de software e clientes pagantes ao mesmo tempo, sem separação de contexto, dados ou permissões.

**Isso nunca foi a decisão de produto.** Já está definido e implementado no backend que os contextos são separados.

### O que aproveitar deste design system

- ✅ **Tokens visuais** (`colors_and_type.css`) — paleta, tipografia, espaçamento: corretos e aproveitáveis
- ✅ **Fundamentos de marca** — logo proposto, tom de voz, iconografia: corretos como proposta
- ✅ **Componentes isolados** — botões, badges, inputs, tabelas no `preview/`: corretos
- ⚠️ **Telas da plataforma** (`ui_kits/plataforma/`) — usar como referência visual e de componentes **apenas**, ignorando a lógica de negócio e a estrutura de navegação. Refazer com a separação correta de perfis
- ⚠️ **Telas do site** (`ui_kits/site/`) — proposta válida como ponto de partida, mas a copy precisa refletir o modelo B2B correto (cliente = escritório, não empresa genérica)

---

---

## 📌 Company & product context

Efficience Co builds **bespoke software for accounting, administrative and
management offices** (_escritórios de contabilidade, administração e gestão_).
The model: walk into an office, map how everything actually works, then ship
software that removes the real day-to-day bottlenecks — automating manual
processes and eliminating rework. Revenue is a monthly license + ongoing
maintenance fee.

The product is **hybrid** — part cloud, part on-premise:

| Layer | What it is | Tech |
|---|---|---|
| **Plataforma** (the dashboard) | Cloud web app where offices manage obligations, processes, rules, users and communication | React + Next.js + Tailwind |
| **Agente local** | A headless Python agent installed on the client's machine; runs automations in the background, validates the license against the API every 24h | Python |
| **Backend / Licença** | API + JWT auth + Stripe licensing. If payment fails, the license deactivates and the agent stops | Node.js + Express + Stripe |
| **Banco de dados** | Per-tenant data with Row-Level Security | PostgreSQL via Supabase |

**Core product surfaces (modules in the dashboard):**
Dashboard · Obrigações (tax/compliance deadlines) · Processos · Logs ·
Regras (automation rules) · Usuários · Comunicação (notifications) ·
Admin (clientes & licenças).

### The two products this system covers
1. **Plataforma (Web App)** — the authenticated dashboard. The existing,
   real product surface. `ui_kits/plataforma/`
2. **Site (Marketing Website)** — does not exist yet; built here as inspiration,
   using the README copy + brand foundations. `ui_kits/site/`

---

## 🗂️ Sources

This system was reverse-engineered from the company's own repository. If you have
access, explore these to build with higher fidelity:

- **GitHub — product monorepo:** https://github.com/EfficienceCo/EfficienceCo
  - `frontend/` — the React/Next dashboard (primary source of the visual language)
  - `README.md` — company positioning, architecture, team, tone of voice
  - `docs/` — `arquitetura.md`, `especificacao-funcional.md`, `decisoes-tecnicas.md`
  - `agente/` — the Python local agent
  - `backend/` — Node API + Stripe licensing

> Nothing from that repo is assumed to be accessible to the reader. The relevant
> tokens, components and copy have been lifted into this design system.

---

## 🧭 Index / manifest

Root files:
- **`README.md`** — this file (context, content & visual foundations, iconography, manifest)
- **`colors_and_type.css`** — all design tokens: color scales, semantic tokens, type classes, radii, shadows, spacing, motion. Import this anywhere.
- **`SKILL.md`** — Agent-Skill front-matter so this folder works as a downloadable Claude Skill.
- **`assets/`** — logo marks (`logo-mark.svg`, `logo-mark-solid.svg`, `logo-glyph.svg`) and brand imagery.
- **`preview/`** — small HTML specimen cards that populate the Design System tab (colors, type, components, etc.).
- **`ui_kits/plataforma/`** — high-fidelity recreation of the dashboard product (sidebar, widgets, tables, login). `index.html` is an interactive click-through.
- **`ui_kits/site/`** — proposed marketing website (hero, features, pricing, footer). `index.html` is the landing page.

---

## ✍️ Content fundamentals

How Efficience Co writes. Pulled from the product UI and company README.

- **Language:** **Brazilian Portuguese**, first. Any English here is scaffolding.
  Keep product copy in pt-BR (`lang="pt-BR"`).
- **Voice:** plain, confident, operational. It sounds like a competent operator
  who respects your time — not a hype startup. Short declarative sentences.
- **Person:** addresses the office as **"você"** implicitly, but leans on
  **outcome nouns** over commands. Headlines are benefit statements, not slogans.
- **The signature rhythm** is a two-beat contrast: a negative removed, a positive
  gained. The tagline is the template:
  - _"Menos retrabalho, mais resultado."_
  - _"Entramos no escritório, mapeamos como tudo funciona, e entregamos um software que resolve os gargalos reais."_
- **Casing:** sentence case everywhere — buttons, headings, labels
  (_"Atualizar painel"_, _"Ver detalhes"_, _"Entrar na plataforma"_). The only
  uppercase is the **eyebrow / kicker** (`EFFICIENCE CO`, letter-spaced) and
  small table/stat labels (_"EM ANDAMENTO"_).
- **Microcopy is direct and literal**, never cute. Empty states state the fact:
  _"Nenhuma obrigação para os próximos dias."_, _"Nenhum processo em andamento no momento."_
  Errors are practical and tell you what to do: _"Preencha e-mail e senha."_,
  _"Não foi possível conectar com a API."_, _"Tentar novamente."_
- **Numbers & dates** are Brazilian: `dd/mm/aaaa`, `pt-BR` Intl formatting,
  R$ currency. Data is treated as first-class — stats are big, labelled, terse.
- **Vocabulary** is domain-accurate accounting/ops Portuguese: _obrigações,
  vencimento, prazo, processos, em atraso, licença, escritório, homologação._
- **No emoji in product UI.** (The repo README uses section emoji as GitHub
  decoration only — that's documentation styling, not the product voice.)
- **Vibe:** trustworthy, efficient, a little technical. Think "a great
  accountant's software," not "a playful consumer app."

**Do / Don't**
- ✅ _"Acompanhe os principais dados dos módulos em tempo real."_
- ✅ _"Vencimentos dos próximos 7 dias."_
- ❌ _"🚀 Supercharge your office workflow!"_ (hype, English, emoji)
- ❌ _"OOPS! Algo deu errado 😬"_ (cute error — be literal instead)

---

## 🎨 Visual foundations

### Brand color
The product is anchored on **sky blue** (`--brand-500 #0EA5E9`) — bright,
trustworthy, slightly technical. It's the only chromatic brand color; everything
else is neutral or semantic. On **light** surfaces use `--brand-600/700` for text
and links (contrast); on **dark** surfaces use `--brand-300/400`. Primary buttons
fill brand and use **near-black text** (`--fg-on-brand`), a distinctive choice
carried over from the product login.

### Neutrals
**Slate** is the canonical neutral (cool, tech-leaning) — `slate-900` text,
`slate-500` muted, `slate-200` borders, `slate-50`/white surfaces. The original
app mixed `zinc` and `slate`; this system unifies on **slate** so the light app
and the dark hero share one temperature.

### Semantics
- **Emerald** = success / active / license valid
- **Amber** = warning / suspended / overdue (_em atraso_)
- **Rose** = error / inactive / destructive

Each is used as a **soft tinted chip**: pale-50/100 background + 700 text, e.g.
`bg-emerald-100 text-emerald-700`. Never large fills of semantic color — they're
status accents.

### Type
- **Display / headings → Space Grotesk** (geometric, technical, a little
  characterful). Tight tracking (-0.02em), weight 600.
- **Body / UI → Manrope** (clean humanist workhorse, great numerals).
- **Data / logs / license keys / code → JetBrains Mono**, tabular numerals.
- Headings are **sentence case, semibold**, never thin. See `.t-*` classes in
  `colors_and_type.css`.

> **⚠️ Type substitution flag.** The codebase ships **system-sans only**
> (`ui-sans-serif, system-ui, …`) — it has no brand typeface. Space Grotesk +
> Manrope + JetBrains Mono are a **proposed** type system (all free Google Fonts).
> If you'd rather keep system-sans, or have a licensed brand face, swap the three
> `--font-*` variables in `colors_and_type.css`. **Please confirm or replace.**

### Spacing & layout
4-pt spacing scale. Generous padding inside cards (20–24px). The app is a
**fixed left sidebar (264px) + fluid content** shell on desktop, collapsing to a
top bar on mobile. Content is laid out on responsive grids (`md:grid-cols-2`,
`xl:grid-cols-4`) with 16–24px gaps. Comfortable, data-dense but not cramped.

### Corner radii
Deliberately layered: `--r-sm 6` (small controls), `--r-md 8` (buttons, nav
items), `--r-lg 12` (cards, list items), `--r-xl 16`/`--r-2xl 20` (modals,
marketing panels), `--r-full` (badges, pills, avatars). Rounder = more
prominent/marketing; tighter = denser/utility.

### Cards & elevation
The signature container: **white surface, 1px slate-200 border, 12px radius,
`--shadow-sm`** (`rounded-xl border border-slate-200 bg-white shadow-sm`). Shadows
are **cool** (slate-tinted, low opacity) and restrained — elevation comes mostly
from the hairline border, with shadow as a soft lift. Nested list rows drop the
shadow and sit on `slate-50` with the same border. Modals jump to `--shadow-xl`.

### Backgrounds
- **Product:** flat `slate-50` canvas, white cards. No textures.
- **Dark surfaces** (login, marketing hero, agent terminal): a
  `slate-950 → slate-900 → slate-800` diagonal gradient with a subtle frosted
  (`backdrop-blur`) panel on top. Use sparingly — it's the "premium" register.
- No photographic backgrounds, no noise, no heavy gradients in-product.

### Borders, transparency & blur
Hairline `1px` borders are the primary separator (dividers, cards, inputs). On
dark surfaces borders become `white @ 10–18%`. **Blur** (`backdrop-blur`) appears
only on the dark glass login/hero panel and on sticky headers — never inside the
flat product body.

### Motion
Quiet and quick. Transitions are `120–180ms` ease-out (`--ease-out`) on
color/background/border for hovers; no bounces, no parallax, no decorative
animation in-product. Marketing may add gentle fade/translate-up on scroll
(≤320ms). Respect `prefers-reduced-motion`.

### Interaction states
- **Hover:** primary buttons lighten one brand step (`500 → 400`); secondary/ghost
  buttons get a `slate-100` wash; nav items get `slate-100`. Links → `brand-700`.
- **Active / pressed:** subtle — darken one step, no scale transform in-product.
  (Marketing CTAs may use a tiny `scale(.98)`.)
- **Selected (nav):** `brand-50` background + `brand-900` text + `1px brand-300`
  ring — a soft tinted pill, not a hard fill.
- **Focus:** `2px` brand ring at ~22% opacity (`--ring`) + brand border. Always
  visible; never removed.
- **Disabled:** `opacity .6–.7`, `cursor: not-allowed`, button darkens to a flat
  brand-600.

---

## 🔣 Iconography

- **Style:** **outline / line icons**, ~1.8px stroke, 24×24 grid, round caps &
  joins, `currentColor` — the exact style the product ships. They're geometric and
  even-weight (dashboard grid, calendar, list, gear-rules, people, bell, building).
- **Source in the codebase:** hand-authored inline SVGs (no icon library was
  imported). For this design system, use **[Lucide](https://lucide.dev)** — it's a
  near-perfect match for the existing hand-drawn set (same 24px grid, ~1.8 stroke,
  round joins) and is CDN-available. This is a **documented substitution**: the
  product's bespoke icons and Lucide are visually interchangeable; standardizing on
  Lucide makes new screens consistent and fast.
  - CDN: `<script src="https://unpkg.com/lucide@latest"></script>` then `lucide.createIcons()`, or use individual SVGs.
  - Mapping used in the kits: Dashboard→`layout-dashboard`, Obrigações→`calendar-clock`,
    Processos→`folder-kanban`/`clipboard-list`, Logs→`scroll-text`, Regras→`git-fork`/`sliders-horizontal`,
    Usuários→`users`, Comunicação→`bell`, Admin/Clientes→`building-2`, Licença→`badge-check`/`key-round`.
- **Sizing:** 16px inside dense UI (nav, buttons, table cells), 20–24px for
  feature/section icons, 1.5–2px stroke. Keep stroke optical-weight consistent
  with text around it.
- **No emoji** as product iconography. **No unicode glyphs** as icons. **No
  filled/duotone** icons in-product (outline only); marketing may use a brand-tinted
  soft-square behind a line icon.
- The **logo mark** (see below) is the one piece of "filled" brand geometry —
  keep it distinct from the line-icon set.

### Logo
Three stacked rounded bars that read at once as an **"E"**, as **ledger lines**,
and as **motion/efficiency speed-lines** — set in a brand-blue rounded tile.
- `assets/logo-mark.svg` — gradient tile (sky-400→sky-600), white bars. Primary.
- `assets/logo-mark-solid.svg` — flat `brand-500` tile. For small sizes / print.
- `assets/logo-glyph.svg` — bars only, `currentColor`. For monochrome / favicons / on-dark.
- **Wordmark:** the mark + **"Efficience Co"** set in **Space Grotesk SemiBold**,
  with **"Co"** optionally in `--fg-muted`. Clear space = the tile's corner radius
  on all sides. Min mark size 24px.

> The logo is a **proposed** identity (the company had none). Built as inspiration —
> please react, refine, or replace.
