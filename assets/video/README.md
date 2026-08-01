# Video

Web encodes of the His Name is Michael trailer, served from R2 through
`/media/video/…` — not from the Worker's asset bundle, which caps individual
files at 25 MB.

| File | Size | Spec |
|---|---|---|
| `hnim-trailer-1080.mp4` | 43 MB | 1920×1080, H.264 high, ~2.8 Mbps, AAC 160k |
| `hnim-trailer-720.mp4` | 15 MB | 1280×720, H.264 high, ~1.0 Mbps, AAC 128k |

Both are `+faststart` (moov atom ahead of mdat) so playback begins before
the file finishes arriving.

Source: `HNIM_Trailer_v2.mp4`, 3840×2160 at 23.976fps, 79 Mbps, 2:01,
supplied by Aaron Berger. The 1.2 GB master is **not** in this repo — it
lives in Drive. Re-encode from it if a new cut lands.

`sync-media.yml` uploads this directory to R2 on change, keying objects as
`video/<filename>`.

## Variants

| File | Size | Codec |
|---|---|---|
| `hnim-trailer-1080.webm` | 22 MB | VP9 + Opus — preferred where supported |
| `hnim-trailer-1080.mp4` | 43 MB | H.264 + AAC — Safari, and any browser without VP9 |
| `hnim-trailer-720.mp4` | 15 MB | H.264 + AAC — narrow viewports |

The player picks a variant in script rather than with `<source media>`,
which browsers do not honour reliably inside `<video>` — Chromium chose the
720p file on a 1440px viewport during testing.

<!-- variants last verified against production 2026-08-01 -->
