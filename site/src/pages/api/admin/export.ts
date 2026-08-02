import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAdmin } from '../../../lib/admin';

export const prerender = false;

/**
 * The same three tables the People page shows, as CSV.
 *
 * Everything is quoted and every field has a leading =+-@ neutralised. A
 * name like `=cmd|'/c calc'!A1` is a formula the moment a spreadsheet opens
 * this file, and the addresses in here are typed by strangers.
 */

const QUERIES: Record<string, { sql: string; head: string[] }> = {
  list: {
    head: ['email', 'first_name', 'film', 'channel', 'confirmed_at', 'unsubscribed_at', 'created_at'],
    sql: `SELECT email, first_name, film,
                 COALESCE(utm_source, referrer, 'direct') AS channel,
                 confirmed_at, unsubscribed_at, created_at
            FROM subscribers ORDER BY created_at DESC`,
  },
  gifts: {
    head: ['name', 'email', 'amount_cents', 'currency', 'status', 'ip_country', 'utm_source', 'created_at'],
    sql: `SELECT name, email, amount_cents, currency, status, ip_country, utm_source, created_at
            FROM donations ORDER BY created_at DESC`,
  },
  enquiries: {
    head: ['name', 'email', 'amount_band', 'message', 'wants_host', 'status', 'created_at'],
    sql: `SELECT name, email, amount_band, message, wants_host, status, created_at
            FROM support_enquiries ORDER BY created_at DESC`,
  },
};

/** CSV quoting, plus spreadsheet formula defusing. */
const cell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export const GET: APIRoute = async ({ request, url }) => {
  if (!(await isAdmin(request, url))) return new Response('not found', { status: 404 });

  const db = env.DB;
  if (!db) return new Response('unavailable', { status: 503 });

  const tab = url.searchParams.get('tab') ?? 'list';
  const spec = QUERIES[tab];
  if (!spec) return new Response('not found', { status: 404 });

  const { results } = await db.prepare(spec.sql).all<Record<string, unknown>>();
  const body = [
    spec.head.join(','),
    ...(results ?? []).map((r) => spec.head.map((k) => cell(r[k])).join(',')),
  ].join('\r\n');

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response('﻿' + body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="4est-${tab}-${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  });
};
