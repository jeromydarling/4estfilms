import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { zipStream, type ZipEntry } from '../../lib/zip';
import { pressStills, pressCredits } from '../../data/press';

export const prerender = false;

/**
 * The whole press kit as one download.
 *
 * Assembled on the fly from the static assets rather than committed as a
 * second copy of files already in the repo. It streams, so the response
 * starts before the last file has been read and nothing large is ever held
 * in memory at once.
 */
export const GET: APIRoute = async ({ request }) => {
  const origin = new URL(request.url).origin;
  const ASSETS = (env as unknown as { ASSETS?: { fetch: typeof fetch } }).ASSETS;
  if (!ASSETS) return new Response('unavailable', { status: 503 });

  async function* entries(): AsyncGenerator<ZipEntry> {
    // The credits and the loglines, so the archive is useful on its own —
    // a folder of unlabelled stills is not a press kit.
    yield {
      name: '4est-films-press-kit/CREDITS.txt',
      body: new TextEncoder().encode(pressCredits()),
    };

    for (const s of pressStills) {
      const res = await ASSETS!.fetch(new Request(`${origin}${s.src}`));
      if (!res.ok) continue; // a missing file must not abort the archive
      yield {
        name: `4est-films-press-kit/stills/${s.src.split('/').pop()}`,
        body: await res.arrayBuffer(),
      };
    }

    for (const path of ['/brand/4est-logo-bone.webp', '/brand/4est-logo-ink.webp']) {
      const res = await ASSETS!.fetch(new Request(`${origin}${path}`));
      if (!res.ok) continue;
      yield {
        name: `4est-films-press-kit/logo/${path.split('/').pop()}`,
        body: await res.arrayBuffer(),
      };
    }
  }

  return new Response(zipStream(entries()), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': 'attachment; filename="4est-films-press-kit.zip"',
      // No content-length: the size is not known until the last entry is
      // written, and guessing it would truncate the download.
      'cache-control': 'public, max-age=3600',
    },
  });
};
