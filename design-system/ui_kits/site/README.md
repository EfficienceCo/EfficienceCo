# Site — UI Kit (proposed)

A marketing website for **Efficience Co**, built **as inspiration** — the company
had no public site when this system was created. Copy is lifted from the product
README (positioning, the 6-step process, the license model); visuals are the
design-system foundations applied to a dark-hero landing page.

> Not a recreation of an existing site — a proposed v0 to react to.

## Run
Open `index.html`. Single scrolling landing page; the header **Entrar** /
footer links point at `../plataforma/index.html`.

## Sections / components
Sticky glass header · dark gradient hero with eyebrow, two-beat headline
(_Menos retrabalho, mais resultado._), CTAs and a faux product preview · client
logo strip · 6-up feature grid (line icons in brand soft-squares) · 6-step
"Como funciona" process · pricing card (light spec + dark price panel) · dark CTA
band · footer.

## Files
| File | Contents |
|---|---|
| `index.html` | Entry; React + Babel + scripts. |
| `styles.css` | Marketing styling on `../../colors_and_type.css`. |
| `Icons.jsx` | Shared line-icon set (copied from the plataforma kit). |
| `SiteTop.jsx` | `SiteHeader`, `Hero`, `HeroPreview`, `LogosStrip`. |
| `SiteBody.jsx` | `Features`, `HowItWorks`, `Pricing`, `CTA`, `Footer`, mount. |

All copy is pt-BR and follows the content fundamentals in the root README
(sentence case, two-beat benefit lines, no emoji, domain-accurate vocabulary).
