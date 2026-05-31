---
name: efficience-design
description: Use this skill to generate well-branded interfaces and assets for Efficience Co, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files.

Efficience Co is a Brazilian B2B studio that builds custom software for accounting,
administrative and management offices — a hybrid cloud platform plus a local
automation agent. The brand is anchored on **sky blue (#0EA5E9)** with **slate**
neutrals; type is **Space Grotesk** (display) + **Manrope** (body) + **JetBrains
Mono** (data); product copy is **Brazilian Portuguese**, sentence case, plain and
operational, no emoji.

Key files:
- `colors_and_type.css` — all design tokens (color scales, semantic tokens, `.t-*`
  type classes, radii, shadows, spacing, motion). Import this first.
- `README.md` — full context: company, content fundamentals, visual foundations,
  iconography, manifest.
- `assets/` — logo marks (`logo-mark.svg`, `logo-mark-solid.svg`, `logo-glyph.svg`).
- `preview/` — specimen cards for every foundation and component.
- `ui_kits/plataforma/` — the dashboard product (dark rail, cockpit, tables, login).
- `ui_kits/site/` — proposed marketing website.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy
assets out and create static HTML files for the user to view. If working on
production code, copy assets and read the rules here to become an expert in
designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want
to build or design, ask some clarifying questions, and act as an expert designer
who outputs HTML artifacts _or_ production code, depending on the need.

> Note: the logo, the type system, and the marketing site are **proposed**
> directions (the company had none) — flag them as inspiration, not locked spec.
> The dashboard's palette and component grammar are derived from the real product.
