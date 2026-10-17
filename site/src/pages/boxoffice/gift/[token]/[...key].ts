import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { OFFERING } from '../../../../lib/boxoffice';
import { streamObject } from '../../../../lib/r2';

export const prerender = false;

/**
 * Streams one file of the gift to somebody holding a token.
 *
 * The token is checked against the offerings table on every request — a
 * cheap indexed read — so a link that is ever revoked stops working at once
 * rather than at the edge of some cache. Keys are confined to the gift
 * prefix; there is no way to name anything else in the bucket from here.
 */
export const GET: APIRoute = async ({ params, request, url }) => {
  const token = String(params.token ?? '').toLowerCase();
  const key = String(params.key ?? '');
  if (!/^[0-9a-f]{32}$/.test(token) || !key || key.includes('..') || key.startsWith('/')) {
    return new Response('Not found', { status: 404 });
  }

  const bucket = env.MEDIA;
  if (!bucket) return new Response('Media unavailable', { status: 503 });

  const row = await env.DB
    .prepare(`SELECT id FROM bo_offerings WHERE gift_token = ?1`)
    .bind(token)
    .first<{ id: number }>();
  if (!row) return new Response('Not found', { status: 404 });

  const download = url.searchParams.get('download') === '1';
  return streamObject(bucket, OFFERING.giftPrefix + key, request, {
    // Private: the bytes are the same for everyone, the right to them is not.
    cacheControl: 'private, max-age=3600',
    downloadAs: download ? key.slice(key.lastIndexOf('/') + 1) : null,
  });
};
