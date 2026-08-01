/// <reference path="../worker-configuration.d.ts" />

// The adapter exposes bindings here; Astro 7 removed Astro.locals.runtime.env.
declare module 'cloudflare:workers' {
  export const env: Env;
}
