import { env } from 'cloudflare:workers';
import { constantTimeEqual, isAdmin, readCookie, sameOrigin } from './admin';
import type { EventRow } from './boxoffice';

/**
 * Who may run a door.
 *
 * A volunteer in a town we have never been to should never hold the admin
 * password. Each stop has a four-digit PIN that opens that stop's door and
 * nothing else: not another stop, not a refund, not a report. The PIN is
 * exchanged for a session the way the admin password is, so it is typed
 * once at the start of the night and the phone stays signed in through it.
 *
 * Four digits is not much entropy. It is enough because the thing it guards
 * is one night's door, the attempts are rate-limited, and the session lasts
 * twenty hours — long enough for the night, short enough that a phone left
 * in a pew is not a door next week.
 */

const COOKIE = '4est_door';
const PREFIX = 'door:session:';
const RATE = 'door:rate:';
const TTL = 60 * 60 * 20;

const kv = () => (env as unknown as { SESSION?: KVNamespace }).SESSION;

/** The stop a door session is for, or null. */
export async function doorEvent(request: Request): Promise<number | null> {
  const store = kv();
  const id = readCookie(request, COOKIE);
  if (!store || !id || !/^[0-9a-f]{32}$/.test(id)) return null;
  const v = await store.get(PREFIX + id);
  return v ? Number(v) : null;
}

/** Admin, or a door session for exactly this stop, from our own pages. */
export async function canDoor(request: Request, url: URL, eventId: number): Promise<boolean> {
  if (await isAdmin(request, url)) return true;
  return (await doorEvent(request)) === eventId && sameOrigin(request, url);
}

export async function doorRateLimited(request: Request): Promise<boolean> {
  const store = kv();
  if (!store) return false;
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  return Number((await store.get(RATE + ip)) ?? '0') >= 10;
}

export async function doorFailure(request: Request): Promise<void> {
  const store = kv();
  if (!store) return;
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const n = Number((await store.get(RATE + ip)) ?? '0') + 1;
  await store.put(RATE + ip, String(n), { expirationTtl: 900 });
}

export function pinMatches(event: EventRow, offered: string): boolean {
  return Boolean(event.door_pin) && /^\d{4,8}$/.test(offered) && constantTimeEqual(event.door_pin!, offered);
}

export async function openDoor(eventId: number): Promise<string | null> {
  const store = kv();
  if (!store) return null;
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  const id = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  await store.put(PREFIX + id, String(eventId), { expirationTtl: TTL });
  return id;
}

export async function closeDoor(request: Request): Promise<void> {
  const store = kv();
  const id = readCookie(request, COOKIE);
  if (store && id && /^[0-9a-f]{32}$/.test(id)) await store.delete(PREFIX + id);
}

export const doorCookie = (id: string, maxAge = TTL) =>
  [`${COOKIE}=${id}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict', `Max-Age=${maxAge}`].join('; ');

/** Four digits, never starting with 0 so it reads aloud as a number. */
export function newPin(): string {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return String(1000 + (b[0] % 9000));
}

export function newHostToken(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
