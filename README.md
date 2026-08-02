# 4estfilms

The 4est Films site — [4estfilms.studio](https://4estfilms.studio). Astro on a
Cloudflare Worker, with D1 for data, R2 for media, KV for sessions, and
Cloudflare Email for sending.

## The admin area

[`/admin/`](https://4estfilms.studio/admin/) — sign in with `ADMIN_TOKEN`.

| | |
| --- | --- |
| **Overview** | list size, money given, screening demand, signup channels, trailer funnel |
| **People** | mailing list, gifts and supporter enquiries, searchable, CSV export |
| **Newsletter** | compose, send yourself a test, then send to the confirmed list |

Sending is resumable. Each batch is recorded against the campaign name, so
closing the tab mid-send and pressing send again picks up where it stopped
rather than mailing anyone twice. **Always send the test first.**

The session is a cookie that lasts 30 days. Signing out deletes it
server-side, so a copied cookie stops working immediately. Ten wrong
passwords from one address and it stops answering for fifteen minutes.

## Secrets

Set on the Worker (`wrangler secret put NAME`, or the Cloudflare dashboard),
not in the repo. Locally they live in `.dev.vars`, which is gitignored.

| Secret | What it is for | Without it |
| --- | --- | --- |
| `ADMIN_TOKEN` | The admin password. Also the bearer token for `/api/stats`, `/api/broadcast` and `/api/reconfirm`, so there is one secret to rotate rather than two that drift. | No way into `/admin/`; those endpoints 404. |
| `STRIPE_SECRET_KEY` | Creates Stripe Checkout sessions for gifts to KNOWN. | Giving fails closed with a 503. |
| `STRIPE_WEBHOOK_SECRET` | Proves a "payment succeeded" callback really came from Stripe. | Webhook 503s and no gift is ever recorded. |
| `PERPLEXITY_API_KEY` | Researches real cinemas for a city on the screenings pages. | The page still works; the venue shortlist is simply absent. |

`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are GitHub repository
secrets on the `production` environment, used by the deploy and migrate
workflows. The migrate token needs **D1: Edit** — without it you get
"Authentication error [code: 10000]" even as an account super admin, because
the error is about token scope rather than account role.

## Workflows

| Workflow | When |
| --- | --- |
| `ci.yml` | every push — typecheck and build |
| `deploy.yml` | push to `main` |
| `migrate.yml` | manual. Applies every migration in order; already-applied ones are expected no-ops |
| `sync-media.yml` | manual. Pushes `assets/` to R2 |

**Schema changes are not automatic.** A new table needs `migrate.yml` run by
hand after the deploy, and forgetting is how a live checkout ends up writing
to a table that does not exist.

## Local

```sh
npm --prefix site run dev      # localhost:4321, with a local D1 and a mail simulator
npm --prefix site run build
npx --prefix site astro check  # types
```

Local D1 needs the migrations too:

```sh
cd site && npx wrangler d1 execute 4estfilms-db --local --file migrations/0001_subscribers.sql
```

Share cards are rendered from the live site's own fonts and committed:

```sh
npm --prefix site run dev &
node scripts/og.mjs            # all cards, or: node scripts/og.mjs known press
```
