import type { APIRoute } from 'astro';
import {
  checkPassword,
  clearFailures,
  clearedCookie,
  createSession,
  destroySession,
  rateLimited,
  recordFailure,
  sameOrigin,
  sessionCookie,
} from '../../../lib/admin';

export const prerender = false;

const json = (b: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

export const POST: APIRoute = async ({ request, url }) => {
  if (!sameOrigin(request, url)) return json({ ok: false }, 403);

  // Ten wrong guesses in fifteen minutes and this address stops being
  // answered. The password is one secret with no second factor, so the only
  // real defence against grinding it is refusing to keep playing.
  if (await rateLimited(request)) {
    return json({ ok: false, error: 'Too many attempts. Try again in fifteen minutes.' }, 429);
  }

  let password = '';
  try {
    const b = (await request.json()) as { password?: unknown };
    password = typeof b.password === 'string' ? b.password : '';
  } catch {
    return json({ ok: false, error: 'bad request' }, 400);
  }

  if (!checkPassword(password)) {
    await recordFailure(request);
    // Deliberately the same message whether the secret is wrong or unset.
    return json({ ok: false, error: 'That’s not it.' }, 401);
  }

  const id = await createSession();
  if (!id) return json({ ok: false, error: 'Session storage unavailable.' }, 503);

  await clearFailures(request);
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(id) });
};

/** Signing out destroys the session server-side, not just the cookie. */
export const DELETE: APIRoute = async ({ request, url }) => {
  if (!sameOrigin(request, url)) return json({ ok: false }, 403);
  await destroySession(request);
  return json({ ok: true }, 200, { 'set-cookie': clearedCookie() });
};
