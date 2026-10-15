-- Three stops to see the whole flow: a microcinema, a historic house, and an
-- anchor. Real shapes, invented names — a 90-seater sells out in one package,
-- a 670-seater never will, and the reports have to read correctly for both.

INSERT OR IGNORE INTO bo_events
  (slug, venue, city, region, starts_at, doors_at, capacity, blurb, poster, rental_cents, leg, status, notes)
VALUES
  ('tabor-czech-hall',
   'Czech Heritage Hall', 'Tabor', 'SD',
   '2027-03-05T19:00:00-06:00', '2027-03-05T18:15:00-06:00',
   90,
   'Where we shot it. Ninety seats, a borrowed projector, and most of the people who fed the crew.',
   '/og/hnim.jpg',
   40000, 'Dakota opening', 'on_sale',
   'Hall donated the room; rental is the projector and the insurance.'),

  ('sioux-falls-state',
   'State Theatre', 'Sioux Falls', 'SD',
   '2027-03-12T19:30:00-06:00', '2027-03-12T18:45:00-06:00',
   250,
   'The house that premiered Strung, twice. Marquee, balcony, and a lobby that holds a crowd.',
   '/og/hnim.jpg',
   185000, 'Dakota opening', 'on_sale',
   'Four-wall. Rental includes one projectionist and the box office window.'),

  ('omaha-orpheum',
   'Orpheum Theater', 'Omaha', 'NE',
   '2027-03-19T19:30:00-06:00', '2027-03-19T18:30:00-06:00',
   670,
   'The anchor of the first leg. Six hundred and seventy seats, and the first night the film plays to a room that does not already know us.',
   '/og/hnim.jpg',
   560000, 'Dakota opening', 'on_sale',
   'Four-wall plus union stagehand minimum. Merch table in the north lobby only.');

-- Everything is offered everywhere to begin with; the admin can trim a stop.
INSERT OR IGNORE INTO bo_event_products (event_id, sku, price_cents)
SELECT e.id, p.sku, NULL FROM bo_events e CROSS JOIN bo_products p WHERE p.active = 1;

-- The anchor carries a city price on the single ticket. Proof the override
-- path works, and the reason it exists.
UPDATE bo_event_products SET price_cents = 1800
 WHERE sku = 'ticket' AND event_id = (SELECT id FROM bo_events WHERE slug = 'omaha-orpheum');

INSERT OR IGNORE INTO bo_promo_codes (code, partner, event_id, kind, value, max_uses) VALUES
  ('STWENCESLAUS', 'St. Wenceslaus, Tabor',
   (SELECT id FROM bo_events WHERE slug = 'tabor-czech-hall'), 'none', 0, NULL),
  ('CATHEDRALSF', 'Cathedral of St. Joseph, Sioux Falls',
   (SELECT id FROM bo_events WHERE slug = 'sioux-falls-state'), 'none', 0, NULL),
  ('STCECILIA', 'St. Cecilia Cathedral, Omaha',
   (SELECT id FROM bo_events WHERE slug = 'omaha-orpheum'), 'percent', 10, 200),
  ('TOUR2027', 'Tour-wide partners', NULL, 'none', 0, NULL);
