/**
 * Campaign attribution, shared by the signup form and the playback beacons.
 *
 * The first page of a visit is the one that carries the UTM tags, but the
 * signup usually happens two pages later — so the tags are stashed in
 * sessionStorage on arrival and read back at the moment they matter.
 * sessionStorage, not localStorage: a campaign should be credited for the
 * visit it caused, not for one three weeks afterwards.
 */

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  referrer?: string;
  landing_path?: string;
}

const KEY = '4est.attr';
const FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const;

/** Call once per page load. Records the first tagged entry of the session. */
export function capture(): Attribution {
  try {
    const stored = sessionStorage.getItem(KEY);
    if (stored) return JSON.parse(stored) as Attribution;

    const q = new URLSearchParams(location.search);
    const attr: Attribution = {};
    for (const f of FIELDS) {
      const v = q.get(f);
      if (v) attr[f] = v.slice(0, 80);
    }

    // Only record an external referrer. Our own pages referring to each
    // other says nothing about where the visit came from.
    const ref = document.referrer;
    if (ref && !ref.startsWith(location.origin)) attr.referrer = ref.slice(0, 200);

    attr.landing_path = location.pathname.slice(0, 120);
    sessionStorage.setItem(KEY, JSON.stringify(attr));
    return attr;
  } catch {
    // Private mode. Attribution is nice to have; it is not worth an
    // exception on a page whose job is to sell a film.
    return {};
  }
}

export function read(): Attribution {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Attribution;
  } catch {
    return {};
  }
}

/** Per-page-load id, so one viewer's progress marks collapse into one watch. */
export function pageSession(): string {
  const w = window as unknown as { __4estSession?: string };
  if (!w.__4estSession) {
    w.__4estSession = Math.random().toString(36).slice(2, 12);
  }
  return w.__4estSession;
}

/**
 * Fire-and-forget event. `sendBeacon` survives the page being closed, which
 * is exactly when the interesting one (someone leaving mid-trailer) fires.
 */
export function track(name: string, extra: Record<string, string> = {}): void {
  const attr = read();
  const body = JSON.stringify({
    name,
    path: location.pathname,
    session: pageSession(),
    utm_source: attr.utm_source,
    utm_campaign: attr.utm_campaign,
    ...extra,
  });

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/event', new Blob([body], { type: 'application/json' }));
      return;
    }
  } catch {
    /* fall through to fetch */
  }
  void fetch('/api/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}
