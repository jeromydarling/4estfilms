/**
 * Streaming an object out of R2, properly.
 *
 * Video needs HTTP Range or the browser cannot seek and Safari refuses to
 * play at all, so range requests are handled rather than falling back to
 * whole-object reads. Shared by the public media route and the gift route,
 * which differ only in who may ask and what they may ask for.
 */

const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  // Served as audio/ogg rather than audio/opus: Safari and older Firefox
  // will not touch the latter, and the codecs are in the container anyway.
  opus: 'audio/ogg',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  wav: 'audio/wav',
};

export const mimeFor = (key: string) =>
  MIME[key.slice(key.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';

export async function streamObject(
  bucket: R2Bucket,
  key: string,
  request: Request,
  opts: { cacheControl: string; downloadAs?: string | null }
): Promise<Response> {
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
    const last = start !== undefined ? Math.min(end ?? size - 1, size - 1) : size - 1;

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
  if (!headers.get('content-type')) headers.set('content-type', mimeFor(key));
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', opts.cacheControl);
  if (opts.downloadAs) {
    headers.set(
      'content-disposition',
      `attachment; filename="${opts.downloadAs.replace(/["\r\n]/g, '')}"`
    );
  }

  return new Response(object.body, { status, headers });
}
