import { env } from 'cloudflare:workers';

/**
 * Who is allowed into /admin, and how they stay there.
 *
 * One shared password — ADMIN_TOKEN, the same secret that already guards
 * /api/stats and /api/broadcast, so there is one thing to set and one thing
 * to rotate rather than two that drift apart.
 *
 * The password is exchanged for a session so it is typed once rather than
 * held in a browser tab, and so revoking access is deleting keys rather than
 * changing a secret everybody has to be told about again.
 */

const COOKIE = '4est_admin';
const PREFIX = 'admin:session:';
const RATE = 'admin:rate:';
/** Thirty days. Long enough not to be a nuisance, short enough to expire. */
const TTL = 60 * 60 * 24 * 30;

const kv = () => (env as unknown as { SESSION?: KVNamespace }).SESSION;
const password = () => (env as unknown as { ADMIN_TOKEN?: string }).ADMIN_TOKEN;

/** Length-independent compare, so the secret cannot be guessed a byte at a time. */
export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  // Fold the length difference in rather than returning early on it.
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** 32 hex characters from the platform CSPRNG. */
function newId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/**
 * Whether the request came from our own pages.
 *
 * Astro's global origin check is off — it has to be, because Gmail's
 * one-click unsubscribe is a cross-origin form post we are required to
 * accept. So the check lives here instead, on the only routes that carry
 * ambient credentials. SameSite=Strict already stops the browser sending the
 * cookie cross-site; this is the belt to that pair of braces.
 */
export function sameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get('origin');
  // Same-origin fetches from some browsers omit Origin on GET. Anything that
  // changes state is a POST, and browsers always send Origin on those.
  if (!origin) return request.method === 'GET';
  try {
    return new URL(origin).origin === url.origin;
  } catch {
    return false;
  }
}

/** Too many wrong guesses from one address, too fast. */
export async function rateLimited(request: Request): Promise<boolean> {
  const store = kv();
  if (!store) return false;
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const n = Number((await store.get(RATE + ip)) ?? '0');
  return n >= 10;
}

export async function recordFailure(request: Request): Promise<void> {
  const store = kv();
  if (!store) return;
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const n = Number((await store.get(RATE + ip)) ?? '0') + 1;
  // Fifteen minutes, not forever: a locked-out owner who waits is fine, a
  // permanently locked-out owner starts disabling the lock.
  await store.put(RATE + ip, String(n), { expirationTtl: 900 });
}

export async function clearFailures(request: Request): Promise<void> {
  const store = kv();
  if (!store) return;
  await store.delete(RATE + (request.headers.get('cf-connecting-ip') ?? 'unknown'));
}

export function checkPassword(offered: string): boolean {
  const secret = password();
  // A missing secret is a misconfiguration, and the safe reading of a
  // misconfiguration is "no".
  return Boolean(secret) && Boolean(offered) && constantTimeEqual(secret!, offered);
}

export async function createSession(): Promise<string | null> {
  const store = kv();
  if (!store) return null;
  const id = newId();
  await store.put(PREFIX + id, new Date().toISOString(), { expirationTtl: TTL });
  return id;
}

export async function hasSession(request: Request): Promise<boolean> {
  const store = kv();
  const id = readCookie(request, COOKIE);
  if (!store || !id || !/^[0-9a-f]{32}$/.test(id)) return false;
  return (await store.get(PREFIX + id)) !== null;
}

export async function destroySession(request: Request): Promise<void> {
  const store = kv();
  const id = readCookie(request, COOKIE);
  if (store && id && /^[0-9a-f]{32}$/.test(id)) await store.delete(PREFIX + id);
}

export function sessionCookie(id: string, maxAge = TTL): string {
  return [
    `${COOKIE}=${id}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    // Strict, not Lax: nothing should follow a link into the admin area with
    // the cookie attached, and there is no cross-site flow to break.
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
  ].join('; ');
}

export const clearedCookie = () => sessionCookie('', 0);

/**
 * The single admission test for anything privileged.
 *
 * A bearer token is accepted without an origin check because a cross-site
 * form post cannot set an Authorization header — that is what makes the
 * curl-shaped scripts safe. A cookie is ambient, so it only counts when the
 * request also came from us.
 */
export async function isAdmin(request: Request, url: URL): Promise<boolean> {
  const secret = password();
  if (!secret) return false;

  const offered = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (offered && constantTimeEqual(secret, offered)) return true;

  return (await hasSession(request)) && sameOrigin(request, url);
}
