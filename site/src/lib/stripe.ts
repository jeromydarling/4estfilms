/**
 * The bits of Stripe we need in a Worker.
 *
 * Written out rather than taken from the SDK because the SDK's verifier wants
 * Node's crypto, which a Worker does not have.
 */

/** Constant-time compare of two hex digests. */
const equalHex = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Verifies Stripe's `Stripe-Signature` header.
 *
 * The timestamp check is not optional: without it a captured request could be
 * replayed forever.
 */
export async function verifySignature(
  payload: string,
  header: string,
  secret: string
): Promise<boolean> {
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i), p.slice(i + 1)];
    })
  ) as { t?: string; v1?: string };

  if (!parts.t || !parts.v1) return false;

  const age = Math.abs(Date.now() / 1000 - Number(parts.t));
  if (!Number.isFinite(age) || age > 300) return false;

  const k = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    k,
    new TextEncoder().encode(`${parts.t}.${payload}`)
  );
  return equalHex(toHex(sig), parts.v1);
}

/** The shape of `checkout.session.completed`, to the depth we read it. */
export interface CheckoutSession {
  id: string;
  payment_intent?: string;
  amount_total?: number;
  currency?: string;
  customer_details?: { email?: string; name?: string };
  customer_email?: string;
  metadata?: Record<string, string>;
}
