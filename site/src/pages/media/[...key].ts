import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  // Served as audio/ogg rather than audio/opus: Safari and older Firefox
  // will not touch the latter, and the codecs are in the container anyway.
  opus: 'audio/ogg',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  wav: 'audio/wav',
};

/**
 * Streams media out of the R2 bucket.
 *
 * Video needs HTTP Range or the browser cannot seek and Safari refuses to
 * play at all, so range requests are handled properly rather than falling
 * back to whole-object reads.
 */
export const GET: APIRoute = async ({ params, request }) => {
  const bucket = env.MEDIA;
  if (!bucket) return new Response('Media unavailable', { status: 503 });

  const key = params.key;
  if (!key || key.includes('..')) return new Response('Not found', { status: 404 });

  const range = request.headers.get('range');
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);

  let object: R2ObjectBody | null;
  let status = 200;
  const headers = new Headers();

  if (match) {
    const head = await bucket.head(key);
    if (!head) return new Response('Not found', { status: 404 });

    const size = head.size;
    const start = match[1] ? Number(match[1]) : undefined;
    const end = match[2] ? Number(match[2]) : undefined;

    // bytes=-500 means "the last 500 bytes", not "from 0 to 500".
    const offset = start ?? (end !== undefined ? Math.max(0, size - end) : 0);
    const last = start !== undefined ? (end ?? size - 1) : size - 1;

    if (offset >= size || offset > last) {
      return new Response('Range not satisfiable', {
        status: 416,
        headers: { 'content-range': `bytes */${size}` },
      });
    }

    const length = last - offset + 1;
    object = await bucket.get(key, { range: { offset, length } });
    if (!object) return new Response('Not found', { status: 404 });

    status = 206;
    headers.set('content-range', `bytes ${offset}-${last}/${size}`);
    headers.set('content-length', String(length));
  } else {
    object = await bucket.get(key);
    if (!object) return new Response('Not found', { status: 404 });
    headers.set('content-length', String(object.size));
  }

  object.writeHttpMetadata(headers);
  // R2 only carries a content-type if one was set at upload time; without it
  // browsers refuse to play the file. Fall back to the extension.
  if (!headers.get('content-type')) {
    const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
    headers.set('content-type', MIME[ext] ?? 'application/octet-stream');
  }
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  // Media is content-addressed by path and never edited in place.
  headers.set('cache-control', 'public, max-age=31536000, immutable');

  return new Response(object.body, { status, headers });
};
