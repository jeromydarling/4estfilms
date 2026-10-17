import { env } from 'cloudflare:workers';
import { getEvent } from './boxoffice-db';
import { SITE } from './email';
import { OFFERING } from './boxoffice';

/**
 * The free-will offering: where the QR points, and what the gift contains.
 */

/** `tour` for the tour as a whole; otherwise a stop that exists, or null. */
export async function giveUrl(slug: string): Promise<string | null> {
  if (slug === 'tour') return `${SITE}/boxoffice/give/`;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const event = await getEvent(slug);
  return event ? `${SITE}/boxoffice/give/${event.slug}/` : null;
}

export interface GiftItem {
  /** Path under the gift prefix, as it appears in the stream URL. */
  key: string;
  title: string;
  kind: 'video' | 'audio' | 'other';
  size: number;
}

/**
 * Whatever has been uploaded under the gift prefix, titled from its filename.
 *
 * Zero configuration on purpose: drop `02-the-lantern-song.mp3` into
 * private/gift/ and it appears as "The Lantern Song" with a player and a
 * download. Numbers at the front of a name sort it and are stripped.
 */
export async function giftItems(): Promise<GiftItem[]> {
  const bucket = (env as unknown as { MEDIA?: R2Bucket }).MEDIA;
  if (!bucket) return [];

  const items: GiftItem[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: OFFERING.giftPrefix, cursor, limit: 500 });
    for (const o of page.objects) {
      const key = o.key.slice(OFFERING.giftPrefix.length);
      if (!key || key.endsWith('/')) continue;
      const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
      const kind = ['mp4', 'webm', 'mov'].includes(ext)
        ? 'video'
        : ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus'].includes(ext)
          ? 'audio'
          : 'other';
      items.push({ key, title: titleOf(key), kind, size: o.size });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return items.sort((a, b) => a.key.localeCompare(b.key));
}

function titleOf(key: string): string {
  const base = key.slice(key.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
  const words = base.replace(/^\d+[-_. ]*/, '').replace(/[-_]+/g, ' ').trim();
  return words.replace(/\b\w/g, (c) => c.toUpperCase()) || base;
}
