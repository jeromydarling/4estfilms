import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://4estfilms.studio',
  output: 'server',
  adapter: cloudflare({
    imageService: 'compile',
    platformProxy: { enabled: true },
  }),
  build: { inlineStylesheets: 'auto' },
  compressHTML: true,

  // Astro's origin check rejects any non-GET request with a form-ish
  // content-type unless the Origin header matches. That is precisely the
  // request Gmail and Yahoo send for one-click unsubscribe — form-encoded,
  // from their servers, with no Origin of ours — so leaving it on returns
  // 403 to the mail providers, and an unsubscribe they cannot complete is
  // what turns into a spam complaint and a filtered domain.
  //
  // Turning it off costs nothing here, because CSRF is an attack on
  // *ambient credentials* and this site has none:
  //   - no cookie or session authenticates any state change;
  //   - /api/stats, /api/broadcast and /api/reconfirm require an
  //     Authorization header, which a cross-site form post cannot set;
  //   - /api/notify's worst case is a confirmation email that does nothing
  //     until the real owner clicks it — that is what double opt-in is for,
  //     and resends are already capped at one an hour per address;
  //   - /unsubscribe must accept a cross-origin POST by design, and only
  //     ever removes the holder of a 128-bit token.
  // Revisit this the moment anything here starts authenticating with a cookie.
  security: { checkOrigin: false },
  // Content pages are pure static; only the API routes need the server.
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
});
