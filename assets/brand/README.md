# Brand

`4est-logo-master.jpg` — the supplied artwork, 4160×3120, black ink on white.
`4est-logo-sting.mp4` — the animated identity: a PLAY marker and a counting-
down timecode over oxblood, scanlines and tape noise, the mark assembling
rose-first. It is the reference for how the brand behaves in motion.

Derived for the site in `site/public/brand/` — the ink is cut out of the
paper and recoloured, so the mark sits on any ground:

| File | Use |
|---|---|
| `4est-logo-bone.webp` | on dark grounds — nav and hero |
| `4est-logo-ink.webp` | on light grounds |
| `4est-logo-blood.webp` | single-colour oxblood |

## What the identity dictates

The mark pairs two opposed hands: **4EST** is blocky and pixelled, **Films**
is drawn, its stem growing roots, with a thorned rose across the crossbar.
The site takes that pairing literally — a monospace carries labels,
timecodes and metadata (the machine half), a serif carries headlines (the
drawn half).

**Oxblood `#96001f`** is sampled from the sting and is the house colour.
`#c4082e` is the same red lifted for small text on dark grounds, where
`#96001f` falls below a readable contrast.

Films keep their own **ground** — forest for Strung, night for His Name is
Michael — but not their own accent. The red is what makes them one company.

## The sting on the site

`site/public/brand/sting.{webm,mp4}` are web encodes of the identity sting,
played once per session as the home page opens and then dissolved into the
hero — which lands on the same mark the sting finishes assembling.

Served from the Worker's asset bundle rather than R2: at ~230 KB it is
nowhere near the 25 MB per-file cap, and keeping it out of R2 means the
intro has no dependency on a media sync having run.

**The source is 738×414**, so it is upscaled on desktop. It reads as
intentional against a videotape treatment, but a higher-resolution master
would hold up better on large displays if one exists.
