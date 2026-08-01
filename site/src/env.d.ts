declare module 'cloudflare:workers' {
  export const env: Env;
}

interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  SESSION: KVNamespace;
}
