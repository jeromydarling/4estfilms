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
| `BOXOFFICE_STRIPE_SECRET_KEY` | The box office's own Stripe key, so the tour can run on a test key while donations stay live. Falls back to `STRIPE_SECRET_KEY`. | Box office checkout fails closed with a 503. |
| `BOXOFFICE_LIVE` | Must be the string `true` before the box office will use an `sk_live_` key. | A live key is refused and nothing can charge a real card. |

`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are GitHub repository
secrets on the `production` environment, used by the deploy and migrate
workflows. The migrate token needs **D1: Edit** — without it you get
"Authentication error [code: 10000]" even as an account super admin, because
the error is about token scope rather than account role.

## The box office

`/boxoffice/` — ticketing and merch for the 2027 tour. Three faces on one app:

| | |
| --- | --- |
| **Public** | `/boxoffice/` and `/boxoffice/<stop>/` — mobile-first, no account, Stripe Checkout (cards plus Apple/Google Pay). Tickets arrive by email, one QR per seat. |
| **Door** | `/boxoffice/door/` — scan, will-call by name, sell at the window. Admin sign-in. |
| **Admin** | `/admin/boxoffice/` — stops, promo codes, per-stop reports, refunds, inventory. |

**Open a stop in door mode while you still have signal.** It caches the whole
will-call list, every ticket code and the price list into IndexedDB, then works
with nothing. Check-ins and cash sales queue locally and sync when the signal
comes back; both are idempotent, so a replayed queue cannot sell a seat or
admit a person twice. Card sales need a connection — the buyer scans a QR and
pays on their own phone. Cash is the offline path.

**Money.** Everything is integer cents. Stripe fees are read off the balance
transaction rather than estimated from 2.9% + 30¢, because the published rate
is not what lands and a tithe computed from a rate card is wrong at every stop.
Net is gross less refunds, fees and the house; the tithe is 10% of net, and nil
when a stop does not clear. The free-will offering is passed on whole, so it is
reported but never counted as retained.

**The free-will offering.** Two halves. The cash in the basket is counted by
hand and typed into the stop's report. The card half comes through a QR on a
printed sign — `/boxoffice/give/<stop>/sign/` from the report page, or
`/boxoffice/give/tour/sign/` for the tour as a whole — which opens
`/boxoffice/give/<stop>/`: four amounts or your own, Stripe Checkout with the
"Donate" wording, attributed to that stop so the parish's settlement shows what
their own people gave. The report shows cash, card less Stripe's fee, and one
line for what the parish is owed (tithe plus offering).

Every card gift is answered with a link to `/boxoffice/gift/<token>/`: the
making-of documentary and the songs from the film. **The gift is whatever is in
the R2 bucket under `private/gift/`** — upload `01-making-of.mp4` and
`02-the-lantern-song.mp3` and they appear, titled from the filename, for
everyone who has ever given. The public `/media/` route refuses `private/`, so
nothing under that prefix can be reached without a token.

```
wrangler r2 object put 4estfilms-media/private/gift/01-making-of.mp4 --file making-of.mp4
```

**Test first.** The box office refuses an `sk_live_` key unless `BOXOFFICE_LIVE`
is explicitly `true`, so a rehearsal cannot charge a real card.

### Running a hundred doors

Everything below lives on a stop's report page (`/admin/boxoffice/report/?slug=`).

| | |
| --- | --- |
| **Door PIN** | Four digits per stop. Opens `/boxoffice/door/<stop>/` and nothing else — not another stop, not a refund, not a report. Session lasts twenty hours; ten wrong tries and the address waits fifteen minutes. "New PIN" revokes the old one at once. |
| **Host's page** | `/boxoffice/host/<token>/` — read-only for the parish coordinator: seats sold, their own codes, what they're owed and what's been paid. No buyer names, no fees, no tour-side figures. "New link" revokes the old one. |
| **Holds** | Seats kept off the web (clergy, press, the crew's family). The door still sells them. On the stop form. |
| **Comps** | Real tickets at $0 — they scan, they count as a body, they show as a seat given away. Emailed if an address is given. |
| **Group invoices** | A parish buying forty seats on a cheque. Created, the seats are held against capacity and nothing is minted; marked paid (with the cheque number), the tickets are minted and sent; cancelled, the seats go back. |
| **Settling up** | Record each payment out — tithe, offering, rental — and the report shows what's still due. The **settlement statement** is one printable sheet to hand the pastor. The dashboard's "Still to pay out" tile is every past stop not yet settled. |
| **Waitlist** | A sold-out stop takes names. When a second showing opens, "Send to the waitlist" writes to each person once. |
| **The morning after** | "Send to ticket holders" — a prefilled thank-you with the offering link, one per address. |
| **Device names** | Each door phone names itself once ("Door A"); check-ins carry it, so a double scan can be traced. Doors refresh from the server every half minute while online, so a seat scanned on one phone shows on the next. |

### Sponsor a Family

An optional add-on on every stop page, after the tickets and before payment:
One Family ($60, 4 seats), Five Families ($300, 20 seats), and — only where the
stop's local partner is confirmed — The Whole Block ($750, 50 seats), each with
a quantity. Skipping it is the default and takes no action. A sponsorship is
bound to the stop being bought unless the buyer picks another upcoming one
("sponsor in a different city"). It is one more line on the same Stripe
payment, with `sponsor_tier`, `sponsor_qty`, `sponsor_seats` and
`sponsor_stop_id` on the session, on the payment intent, and on the order;
the webhook adds `buyer_email` to the payment once Checkout has it.

The pool per screening is on the report: seats sponsored (summed from paid
orders, so a refund gives them back), claimed by the partner, released at
showtime, and what is still to place — capped at 50 per stop at checkout. The
partner's name and confirmed flag are on the stop form. The thank-you on the
success page and in the ticket email says the seats and the city and nothing
about the family; placement is anonymous through the partner. These are
purchases of seats for distribution, not donations, and nothing calls them
tax-deductible. Checkout copy is the headline and one line; the rest belongs
in the one-pager.

**Sales tax** runs through Stripe Tax when `BOXOFFICE_TAX=true` — activate Stripe
Tax in the dashboard first, or every checkout fails. Tickets use Stripe's own
default for ticket sales (`txcd_20030000`, General – Services) and merch the
general tangible-goods code (`txcd_99999999`); both can be overridden with
`BOXOFFICE_TAX_CODE_TICKET` / `BOXOFFICE_TAX_CODE_MERCH`. Tax is exclusive — a
$15 ticket is $15 in every state — and recorded on the order as `tax_cents`,
outside gross. The venue-sourced amusement codes need a performance location
Checkout can't carry; that's the thing to come back for if a state demands it.

**The digest** — `POST /api/admin/boxoffice/digest` with the admin bearer token —
emails yesterday's sales by stop, soft stops in the next fortnight, parishes
still owed, waitlists and low stock to `DIGEST_TO` (or the house address).
The `Box office digest` workflow fires it every morning; it needs `ADMIN_TOKEN`
in the production environment's secrets.

**Not here, by design:** Tap to Pay. The door's card path (a QR the buyer pays
on their own phone) is the right call for a web app; a card reader for a queue
of two hundred needs Stripe Terminal hardware and its JS SDK — an afternoon,
once there's a reader to test against.

## Workflows

| Workflow | When |
| --- | --- |
| `Box office digest` | Every morning at 12:45 UTC, and by hand. Asks the Worker to send the day's box office email. Needs `ADMIN_TOKEN` in the production environment. |
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
