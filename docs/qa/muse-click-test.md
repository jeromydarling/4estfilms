# Click test — the 4est Films box office

A prompt for Muse AI (or any browser agent) to walk the box office the way a
person would: taps, typing, reading what the screen says back. It checks
behaviour, not code. Copy everything below the line into the agent.

Before you hand it over, fill in the three placeholders:

| Placeholder | Where to find it |
| --- | --- |
| `ADMIN_PASSWORD` | The `ADMIN_TOKEN` Worker secret |
| `DOOR_PIN` | `/admin/boxoffice/report/?slug=tabor-czech-hall` → "Door and host" |
| `HOST_LINK` | Same page, "Host's page" |

If `BOXOFFICE_STRIPE_SECRET_KEY` is a **test** key, the agent can pay with
Stripe's test card and the Stripe sections run. If there is no key yet, it will
see "Checkout isn't available right now" and skip them — that is expected, not
a failure. **Never run this against a live key.**

---

## Your job

You are a careful, slightly impatient person using a website on your phone and
laptop. You are testing the box office for a film tour at
**https://4estfilms.studio/boxoffice/**. Do everything below by clicking and
typing like a human would. After each numbered step, write one line: what you
did, what you saw, and **PASS** or **FAIL** with the reason. Take a screenshot
at every FAIL. Do not stop at the first failure — finish the list.

Rules:
- Use only the Stripe **test** card `4242 4242 4242 4242`, any future expiry,
  any CVC, any ZIP. If a payment page asks for a real card, stop and report.
- Never click **Refund** on an order you did not create in this session.
- Use the email address `qa+<today's date>@4estfilms.studio` everywhere an
  email is asked for, and the name **Quinn Tester**.
- Read the page. If a button says one thing and does another, that is a FAIL
  even if nothing broke.

### Part 1 — Buying a ticket (phone-sized window, ~400px wide)

1. Open https://4estfilms.studio/boxoffice/ . You should see three or more
   stops with a town and a date each. Tap the **Omaha** one.
2. On the Omaha page: confirm the ticket price shown is **$18.00** (Omaha costs
   more than the others). Tap **+** on "Single ticket" twice. The button at the
   bottom should now read **Pay $36.00** and the summary should say **2 seats**.
3. Tap **+** on **T-shirt**. The pay button should change to **Pick a shirt
   size** and be disabled. Pick **M**. The button should read **Pay $61.00**.
4. In the promo box type `stcecilia` (lowercase) and tap **Apply**. You should
   see "Thanks — we'll credit St. Cecilia Cathedral, Omaha", a discount line of
   **−$6.10**, and the button should read **Pay $54.90**.
5. Replace the code with `NOPE` and tap Apply. You should see "That code isn't
   valid" and the total should go back to **$61.00**.
6. Leave "Keep me posted on the tour" ticked. Tap **Pay $61.00**.
   - If you land on a Stripe page: pay with the test card, name **Quinn
     Tester**, your QA email, and "Quinn Tester" in the **Name for will-call**
     box. After paying you should see a thank-you page. Note whether it says
     the tickets are "in your inbox" or "being issued".
   - If instead the page says "Checkout isn't available right now": report
     that and skip to Part 2. That is a PASS for this run.
7. (Only if you paid.) Open the QA mailbox. Within two minutes there should be
   an email "Your tickets — His Name is Michael, Omaha, NE" with **two** square
   codes and two ten-character codes beneath them. Copy both codes. Then look
   for a second email asking you to confirm your subscription — PASS if it is
   there, FAIL if not.

### Part 2 — Sold out, and the waitlist

8. Open https://4estfilms.studio/boxoffice/ and look for a stop marked **sold
   out**. If none is, say so and skip to Part 3 (PASS). If one is, open it: it
   should say the stop is sold out and offer **Put me on the list**.
9. Enter Quinn Tester and the QA email and tap the button. You should see
   "You're on the list." Tap it again with the same email: same message, no
   error.

### Part 3 — The free-will offering (phone)

10. Open https://4estfilms.studio/boxoffice/give/tabor-czech-hall/ . It should
    show **Czech Heritage Hall**, four amount buttons and an "another amount"
    box. The **Give** button should be disabled until you choose something.
11. Tap **$25** — button reads **Give $25.00**. Type `12.99` in the other
    box — button reads **Give $12.99** and the $25 is no longer highlighted.
    Type `0.50` — button goes back to disabled.
12. Type `5` and tap **Give $5.00**.
    - Stripe page: it should say **Donate**, not Pay. Pay with the test card.
      You should land on a thank-you page with an **Open your gift** button.
      Tap it. You should see a page addressed to you ("For Quinn.") that
      either lists a video and songs, or says they are still being cut. Note
      which.
    - No key: "Giving isn't available right now" — PASS, move on.
13. Open https://4estfilms.studio/boxoffice/give/tabor-czech-hall/sign/ . It
    should be a white, printable page with a large square code and the words
    **Scan to give — any amount**. With your phone's camera (or a QR reader),
    scan the code on screen: it must open the giving page from step 10.

### Part 4 — The door (phone)

14. Open https://4estfilms.studio/boxoffice/door/tabor-czech-hall/ in a fresh
    private window (so you are not signed in). You should be asked for a
    **Door PIN**, not sent to a sign-in page.
15. Enter `0000`. You should see "That's not the PIN for this door."
16. Enter `DOOR_PIN`. The door should open: a venue name, three counters
    (**In / Sold / House**), tabs **Scan / Will-call / Sell**, and near the
    bottom "pulled" followed by a time.
17. Type `Door QA` into the small "Name this phone" box at the top right and
    tap elsewhere.
18. In the **Or type the code** box, type `ZZZZZZZZZZ` and tap **Check in**.
    You should see "not on this list".
19. (Only if you bought tickets in Part 1 — and note those were for Omaha,
    not Tabor.) Open https://4estfilms.studio/boxoffice/door/omaha-orpheum/ .
    It should ask for a PIN again (a Tabor PIN does not open Omaha). PASS if
    it asks. Don't try to get in.
20. Back on the Tabor door, tap **Sell**. Tap **+** on **Family package** and
    **+** on **T-shirt**. The cash button should stay disabled until you pick
    a shirt size. Pick **L**. The button should read **Take $75.00 cash**.
21. Turn on **airplane mode** (or disconnect the network). The pill at the top
    right should say **offline** within a few seconds. Type `Offline Quinn`
    in the name box and tap **Take $75.00 cash**. You should see "Cash taken.
    4 seats — codes …" with four codes, a **1 queued** pill, and the Sold
    counter should go up by 4.
22. Still offline, tap **Scan**, type the **first** of those four codes and
    tap Check in. You should see "Offline Quinn — in" and **In** should read
    1. Type the same code again: "already in". The queue pill should now say
    **2 queued**.
23. Tap **Will-call**, search `offline`. One row, "Offline Quinn", "4 seats ·
    door", with a button **admit 3**. Tap it. **In** should read 4 and the
    button should read **all in**.
24. Reconnect the network. Within ten seconds the queued pill should
    disappear and In/Sold should still read 4 and (previous Sold + 4). PASS
    only if the queue drains without you tapping anything.
25. Tap **Refresh list**. The counts must not change.

### Part 5 — The host's page (laptop)

26. Open `HOST_LINK` in a private window. No password should be asked. You
    should see Czech Heritage Hall, seats sold "of 90", a **What the parish
    receives** table, and **no** buyer names anywhere on the page.
27. Change one character of the link and open it. It must say not found.

### Part 6 — Admin (laptop)

28. Open https://4estfilms.studio/admin/ . Enter a wrong password: "That's
    not it." Enter `ADMIN_PASSWORD`: you should land on an overview.
29. Go to **Box office**. You should see tiles for Gross, Net, Tithe,
    Attendees and **Still to pay out**, and a table of stops. Click
    **report** on **Czech Heritage Hall**.
30. On the report: find **Door and host** at the top with a 4-digit PIN and a
    host link. Find **The money** with a line **To the parish**. Find the
    cash sale you made at the door in the **Orders** table (buyer "Offline
    Quinn", "door cash", 4 seats, $75.00).
31. Under **Settling up**, record a payment: What = **Offering to the
    parish**, Amount `1.00`, How `QA test`. After saving, the money table's
    **Still due to the parish** should be exactly $1.00 less than **To the
    parish** showed before. Then click **Remove** on that payment and confirm
    the figure goes back.
32. Under **Comps**, issue **1** seat to name `Quinn Comp`, your QA email, why
    `click test`. You should see "Comps issued." and, in Orders, a row for
    Quinn Comp at $0.00. Check the QA mailbox: a ticket email with one code.
33. Under **Group invoices**, create **3** seats for `QA Parish Group` with
    your QA email. You should see "Invoice created; the seats are held." and
    the invoice listed as **unpaid**. Type `QA cheque` in the small box on
    that row and click **Mark paid**. Status becomes **paid** and the
    mailbox gets an email with three codes.
34. Click **Settlement statement (print)**. A white page should open with the
    venue, a takings table, and a **Balance due to the parish** line.
35. Click **Offering sign (print)** — the same white sign as step 13.
36. Click **Refund** on the **Offline Quinn** cash order (the one you made)
    and confirm. You should see "Refunded; tickets voided and stock
    returned." and the row greyed out with "refunded".
37. Go back to the door (Part 4 window) and tap **Refresh list**, then type
    the first offline code again. You must see "refunded, do not admit".
38. On the admin **Box office** page click **Send the digest now**. The text
    beside it should change to "sent to hello@4estfilms.studio".
39. Sign out (the sign-out link in the admin bar). Open
    https://4estfilms.studio/admin/boxoffice/ again: you should be back at
    the sign-in screen.

### Finish

Give a table of all 39 steps with PASS/FAIL, then list every FAIL with its
screenshot and exactly what you expected versus what you saw. Finally, in one
paragraph, say what felt confusing or slow as a person — not bugs, just
friction.
