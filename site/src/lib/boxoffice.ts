import { env } from 'cloudflare:workers';

/**
 * The box office: shared types, money, and the maths behind the reports.
 *
 * Every amount in this system is an INTEGER number of cents. There is no
 * float anywhere in the path from a card to a tithe cheque, because the
 * cumulative error over forty-eight stops is somebody's rent.
 */

export const TOUR = {
  film: 'His Name is Michael',
  year: 2027,
  /** Of the net, after Stripe and the house. The number the parish is told. */
  tithePercent: 10,
  /** Shirt sizes we carry, in the order a human reads them. */
  sizes: ['S', 'M', 'L', 'XL', '2XL'] as const,
  /** Door staff pick their name from this so reports attribute correctly. */
  operators: ['Jeromy', 'Joseph', 'Keely', 'Volunteer'] as const,
} as const;

export type ProductKind = 'ticket' | 'package' | 'merch';

export interface Product {
  sku: string;
  name: string;
  kind: ProductKind;
  price_cents: number;
  admits: number;
  needs_size: number;
  consumes: string | null;
  blurb: string | null;
  sort: number;
}

export interface EventRow {
  id: number;
  slug: string;
  title: string;
  venue: string;
  city: string;
  region: string | null;
  starts_at: string;
  doors_at: string | null;
  capacity: number;
  blurb: string | null;
  poster: string | null;
  rental_cents: number;
  offering_cents: number;
  leg: string | null;
  status: string;
  notes: string | null;
}

/** What the browser posts: a basket of SKUs, with sizes where they matter. */
export interface BasketLine {
  sku: string;
  qty: number;
  size?: string | null;
}

export const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** Whole dollars, for headline figures where cents are noise. */
export const dollars = (cents: number) =>
  (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

export const parseConsumes = (p: Pick<Product, 'consumes'>): Record<string, number> => {
  if (!p.consumes) return {};
  try {
    const v = JSON.parse(p.consumes) as Record<string, number>;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};

/**
 * Stripe's secret key for the box office, with an interlock.
 *
 * The donation flow already runs on a live key. A tour that is still being
 * rehearsed must not be able to charge a real card because somebody tapped a
 * seed event on their phone — so a live key is refused unless BOXOFFICE_LIVE
 * is explicitly 'true'. Test first is the default, not the discipline.
 */
export function stripeKey(): { key: string | null; live: boolean; error?: string } {
  const e = env as unknown as Record<string, string | undefined>;
  const key = e.BOXOFFICE_STRIPE_SECRET_KEY || e.STRIPE_SECRET_KEY || null;
  if (!key) return { key: null, live: false, error: 'No Stripe key configured.' };

  const live = key.startsWith('sk_live_');
  if (live && e.BOXOFFICE_LIVE !== 'true') {
    return {
      key: null,
      live,
      error:
        'Refusing a live Stripe key: set BOXOFFICE_LIVE=true when the tour is really selling, ' +
        'or set BOXOFFICE_STRIPE_SECRET_KEY to an sk_test_ key.',
    };
  }
  return { key, live };
}

/** 10 unambiguous characters. No O/0, no I/1/L — these get read aloud at a door. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function newTicketCode(): string {
  const b = new Uint8Array(10);
  crypto.getRandomValues(b);
  return [...b].map((x) => ALPHABET[x % ALPHABET.length]).join('');
}

/**
 * Price a basket on the server.
 *
 * The browser sends SKUs and quantities. It does not send prices — a price
 * posted from a phone is a suggestion, not a fact.
 */
export interface PricedLine extends BasketLine {
  name: string;
  unit_price_cents: number;
  admits: number;
  kind: ProductKind;
}

export interface Priced {
  lines: PricedLine[];
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  admits: number;
  error?: string;
}

export function priceBasket(
  basket: BasketLine[],
  products: Map<string, Product>,
  offered: Map<string, number | null>,
  promo?: { kind: string; value: number } | null
): Priced {
  const lines: PricedLine[] = [];
  let subtotal = 0;
  let admits = 0;

  for (const raw of basket) {
    const qty = Math.floor(Number(raw.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 50) continue;

    const p = products.get(raw.sku);
    if (!p) return fail(`Unknown item: ${raw.sku}`);
    if (!offered.has(raw.sku)) return fail(`${p.name} isn’t offered at this stop.`);

    // Override first, catalogue second. Never the posted value.
    const unit = offered.get(raw.sku) ?? p.price_cents;

    let size: string | null = null;
    if (p.needs_size) {
      size = String(raw.size ?? '').toUpperCase();
      if (!(TOUR.sizes as readonly string[]).includes(size)) {
        return fail(`Pick a size for ${p.name}.`);
      }
    }

    subtotal += unit * qty;
    admits += p.admits * qty;
    lines.push({
      sku: p.sku,
      qty,
      size,
      name: p.name,
      unit_price_cents: unit,
      admits: p.admits,
      kind: p.kind,
    });
  }

  if (!lines.length) return fail('Nothing selected.');

  let discount = 0;
  if (promo && promo.kind === 'percent' && promo.value > 0) {
    // Floor, so rounding never invents money the card did not take.
    discount = Math.floor((subtotal * Math.min(promo.value, 100)) / 100);
  } else if (promo && promo.kind === 'fixed' && promo.value > 0) {
    discount = Math.min(promo.value, subtotal);
  }

  return {
    lines,
    subtotal_cents: subtotal,
    discount_cents: discount,
    total_cents: subtotal - discount,
    admits,
  };

  function fail(error: string): Priced {
    return { lines: [], subtotal_cents: 0, discount_cents: 0, total_cents: 0, admits: 0, error };
  }
}

/**
 * What a stop actually made.
 *
 * Written out rather than left to a SQL expression because every line of it
 * is a promise to somebody: the house gets its rental, Stripe takes its cut,
 * and the parish is told a tithe figure that has to survive being checked.
 */
export interface StopReport {
  gross_cents: number;
  discount_cents: number;
  refunded_cents: number;
  fees_cents: number;
  rental_cents: number;
  /** Gross, less refunds, less what Stripe took, less the house. */
  net_cents: number;
  /** Ten per cent of net — and zero when the stop lost money. */
  tithe_cents: number;
  offering_cents: number;
  /** What the tour keeps once the tithe is out. Offerings pass straight on. */
  retained_cents: number;
  attendees: number;
  checked_in: number;
  revenue_per_attendee_cents: number;
}

export function stopReport(input: {
  gross_cents: number;
  discount_cents: number;
  refunded_cents: number;
  fees_cents: number;
  rental_cents: number;
  offering_cents: number;
  attendees: number;
  checked_in: number;
}): StopReport {
  const net =
    input.gross_cents - input.refunded_cents - input.fees_cents - input.rental_cents;

  // A stop that loses money does not generate a tithe. Ten per cent of a
  // negative number is a refund request, not a gift.
  const tithe = net > 0 ? Math.round((net * TOUR.tithePercent) / 100) : 0;

  return {
    ...input,
    net_cents: net,
    tithe_cents: tithe,
    // The free-will offering is collected on the parish's behalf and handed
    // over whole, so it is reported but never added to what the tour keeps.
    retained_cents: net - tithe,
    revenue_per_attendee_cents: input.attendees
      ? Math.round((input.gross_cents - input.refunded_cents) / input.attendees)
      : 0,
  };
}

/**
 * A CSV cell: quoted, and anything a spreadsheet would execute defused.
 *
 * A leading - is deliberately *not* defused when the cell is a plain number.
 * This is a money export and negative numbers are the whole point of a loss
 * column; prefixing them with an apostrophe turns every one into text and
 * breaks the sums the accountant is opening this to do. `-291.17` stays a
 * number, `-cmd|'/c calc'!A1` does not.
 */
const NUMERIC = /^-?\d+(\.\d+)?$/;
export const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+@\t\r]/.test(s) || (s.startsWith('-') && !NUMERIC.test(s))) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export const csv = (head: string[], rows: unknown[][]) =>
  '﻿' + [head.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n');

/** 7:30 PM · Fri 12 Mar 2027, in the stop's own offset. */
export function showTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const m = iso.match(/([+-]\d{2}):?(\d{2})$/);
  const offsetMin = m ? (m[1].startsWith('-') ? -1 : 1) * (Number(m[1].slice(1)) * 60 + Number(m[2])) : 0;
  const local = new Date(d.getTime() + offsetMin * 60_000);
  const date = local.toLocaleDateString('en-US', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
  const time = local.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
  });
  return `${time} · ${date}`;
}
