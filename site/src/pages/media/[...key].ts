import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { streamObject } from '../../lib/r2';

export const prerender = false;

/**
 * Streams media out of the R2 bucket.
 *
 * Anything under private/ is refused here. That prefix is where the things
 * people pay for live — the making-of, the songs — and they are served by
 * routes that check who is asking. A public route that would hand them over
 * to anybody who guessed the filename is not a route, it is a leak.
 */
export const GET: APIRoute = async ({ params, request }) => {
  const bucket = env.MEDIA;
  if (!bucket) return new Response('Media unavailable', { status: 503 });

  const key = params.key;
  if (!key || key.includes('..') || key.startsWith('private/')) {
    return new Response('Not found', { status: 404 });
  }

  // Media is content-addressed by path and never edited in place.
  return streamObject(bucket, key, request, {
    cacheControl: 'public, max-age=31536000, immutable',
  });
};
