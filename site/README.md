# 4estfilms.com

Astro 5, static output, no client framework. Ships ~4 KB of JS (scroll
reveal + parallax); everything else is HTML and CSS.

```bash
cd site
npm install
npm run dev      # localhost:4321
npm run build    # → site/dist
```

## Deploying to Cloudflare Pages

Point Pages at this repo:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Build output | `dist` |
| Root directory | `site` |

## Design

Two films with opposite temperatures under one near-black shell. The
`world` prop on the layout swaps the accent and page ground:

- **`forest`** — *Strung*. Green-black, moss, rust. "Lost in the forest of
  his own mind."
- **`frontier`** — *His Name is Michael*. Night blue, lantern gold. Virginia
  City across 1867 and 1890.

Type is Fraunces (variable, WONK axis on for the display cuts) over Inter,
both self-hosted via fontsource — no external font requests. A grain layer
and vignette sit above everything at fixed position; grain is an inline SVG
data URI so it costs no request.

Motion is opt-in per element: `data-reveal` fades up once on intersect,
`data-parallax="0.09"` drifts against scroll. Both no-op under
`prefers-reduced-motion`.

## Content

All copy lives in `src/data/site.ts`, sourced from
`docs/research/company-and-films.md`. Awards are verified against IMDb;
the diary entries are the team's own words from their production posts.

## Images

`public/stills/` holds only what the site uses:

- `key/` — 16 curated in-costume frames for heroes and features
- `hnim/` — 54-frame gallery spread across the nine shoot days
- `strung/` — 7 frames from the Strung archive

The full 380-still archive is in `/assets/hnim-stills`; originals stay in
Drive. Instagram video is in R2, not here — see
`scripts/upload-media-to-r2.sh`.

## Still to come

Trailer and final key art for both films. The homepage currently leads on
stills; a trailer would take the hero.
