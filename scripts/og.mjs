/**
 * Generates the Open Graph share cards under site/public/og/.
 *
 * These are rendered rather than hand-cut so they stay in the house
 * typography: a headless browser loads the site's own fonts and the same
 * oxblood/bone tokens, screenshots at 1200x630, and the PNGs are committed.
 * Cards change about as often as the film titles do, so paying for this at
 * build time — let alone per request — would be waste.
 *
 *   node scripts/og.mjs                 # all cards
 *   node scripts/og.mjs hnim strung     # just these
 *
 * Requires the dev server for fonts and stills:  npm --prefix site run dev
 */
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'site', 'public');
const OUT = join(PUBLIC, 'og');
const W = 1200;
const H = 630;

/** Cards. `plate` is a still under site/public, `tone` shifts the wash. */
const CARDS = {
  home: {
    plate: 'stills/key/hero-prayer.webp',
    tone: 'rgba(8,8,10,.62)',
    mark: true,
    kicker: 'Independent Film Production · Est. 2015',
    title: '',
    sub: 'Creating and collaborating with love since 2015',
  },
  hnim: {
    plate: 'stills/key/trailer-poster.webp',
    // The trailer master is 2.39:1 letterboxed inside a 16:9 file, so the
    // bars are pixels, not padding. Scale past them.
    zoom: 1.36,
    tone: 'rgba(11,17,24,.55)',
    kicker: 'Coming Late 2026',
    title: 'His Name<br>is Michael',
    sub: 'A supernatural Western musical, set in Virginia City, Nevada',
  },
  strung: {
    plate: 'stills/strung/2020-12-17_CI4q_yUgNeX_01.jpg',
    // A sunlit forest floor. Without a much heavier hand the oxblood kicker
    // disappears into the highlights.
    dim: 0.42,
    tone: 'rgba(13,23,18,.8)',
    kicker: '2019 · 12 awards across 8 festivals',
    title: 'Strung',
    sub: 'Lost in the forest of his own mind',
  },
  about: {
    plate: 'stills/key/two-men.webp',
    tone: 'rgba(8,8,10,.62)',
    kicker: '4est Films',
    title: 'Films made<br>with conviction.',
    sub: 'Created through collaboration',
  },
  press: {
    // Not the schoolroom wide — one of the children is in a modern jersey.
    plate: 'stills/hnim/day7_DSC04453.webp',
    tone: 'rgba(8,8,10,.6)',
    kicker: 'Press',
    title: 'Press kit',
    sub: 'Loglines, credits, stills and contact for both films',
  },
};

const dataUri = async (rel) => {
  const buf = await readFile(join(PUBLIC, rel));
  const ext = rel.split('.').pop();
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${mime};base64,${buf.toString('base64')}`;
};

const html = async (c) => `
<style>
  @font-face {
    font-family: 'Fraunces'; font-style: normal; font-weight: 100 900;
    src: url('${await fontUri('fraunces', 'fraunces-latin-wght-normal')}') format('woff2');
  }
  @font-face {
    font-family: 'JetBrains'; font-style: normal; font-weight: 100 800;
    src: url('${await fontUri('jetbrains-mono', 'jetbrains-mono-latin-wght-normal')}') format('woff2');
  }
  * { margin: 0; box-sizing: border-box; }
  body { width: ${W}px; height: ${H}px; overflow: hidden; background: #08080a; }
  .card { position: relative; width: ${W}px; height: ${H}px; display: flex;
          flex-direction: column; justify-content: flex-end;
          padding: 68px 76px; color: #f2ede3; }
  .plate { position: absolute; inset: 0; width: 100%; height: 100%;
           object-fit: cover; filter: grayscale(.25) brightness(${c.dim ?? 0.72});
           transform: scale(${c.zoom ?? 1}); }
  .wash { position: absolute; inset: 0;
          background: linear-gradient(72deg, ${c.tone} 0%, ${c.tone} 38%, transparent 100%),
                      linear-gradient(to top, rgba(8,8,10,.9), transparent 62%); }
  /* the scanline motif from the sting, at share-card scale */
  .scan { position: absolute; inset: 0; opacity: .3;
          background: repeating-linear-gradient(to bottom,
            rgba(0,0,0,.22) 0 1px, transparent 1px 3px); }
  .body { position: relative; }
  .kicker { font-family: 'JetBrains', monospace; font-size: 19px; font-weight: 500;
            letter-spacing: .22em; text-transform: uppercase; color: #c4082e; }
  .kicker::before { content: '▶'; margin-right: .7em; font-size: .85em; }
  .title { font-family: 'Fraunces', serif; font-weight: 400; font-size: 92px;
           line-height: .94; letter-spacing: -.02em; margin-top: 24px;
           font-variation-settings: 'SOFT' 0, 'WONK' 1, 'opsz' 144; }
  .sub { font-family: 'Fraunces', serif; font-size: 30px; line-height: 1.25;
         color: #d8d1c5; margin-top: ${c.title ? 24 : 30}px; max-width: 24ch;
         font-variation-settings: 'SOFT' 20, 'WONK' 0, 'opsz' 40; }
  .mark { position: relative; width: 420px; margin-top: 18px; }
  .corner { position: absolute; top: 58px; right: 76px; width: 132px; opacity: .92; }
</style>
<div class="card">
  <img class="plate" src="${await dataUri(c.plate)}">
  <div class="wash"></div><div class="scan"></div>
  ${c.mark ? '' : `<img class="corner" src="${await dataUri('brand/4est-logo-bone.webp')}">`}
  <div class="body">
    ${c.kicker ? `<div class="kicker">${c.kicker}</div>` : ''}
    ${c.mark ? `<img class="mark" src="${await dataUri('brand/4est-logo-bone.webp')}">` : ''}
    ${c.title ? `<div class="title">${c.title}</div>` : ''}
    ${c.sub ? `<div class="sub">${c.sub}</div>` : ''}
  </div>
</div>`;

/** The same variable woff2 the site itself serves. Deliberately the
    wght-only cut: fontsource's index.css points at that file, so the
    SOFT/WONK/opsz settings in global.css never actually reach a visitor.
    Loading the "full" cut here would make the cards prettier than the page
    they advertise, which is the wrong kind of lying. */
const fontUri = async (family, file) => {
  const p = join(
    ROOT, 'site', 'node_modules', '@fontsource-variable', family,
    'files', `${file}.woff2`
  );
  return `data:font/woff2;base64,${(await readFile(p)).toString('base64')}`;
};

const only = process.argv.slice(2);
const wanted = only.length ? only : Object.keys(CARDS);

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: W, height: H } });

for (const name of wanted) {
  const card = CARDS[name];
  if (!card) throw new Error(`unknown card: ${name}`);
  await page.setContent(await html(card), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  // JPEG, not PNG: these are photographs, and PNG costs ~8x for no visible
  // gain. Some scrapers (LinkedIn among them) still do not take WebP.
  const buf = await page.screenshot({ type: 'jpeg', quality: 86 });
  await writeFile(join(OUT, `${name}.jpg`), buf);
  console.log(`og/${name}.jpg  ${(buf.length / 1024).toFixed(0)} KB`);
}

await browser.close();
