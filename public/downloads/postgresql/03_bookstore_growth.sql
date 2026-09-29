-- =====================================================================
-- STAGE 3 — THE BOOKSTORE GROWS UP        (Roadmap Intermediate level,
--                                           Modules 18–39)
-- Database: bookstore   (REQUIRES Stage 2 to be loaded first)
--
-- Turns the small bookstore into a realistic business with 2½ years
-- of history (Jan 2023 – Jun 2026):
--
--   authors      +60      (77 total)
--   books        +275     (300 total)  — some very popular, most not
--   customers    +5,000   (5,020 total) — now with a time_zone column
--   orders       ~39,000  — busier in November/December
--   order_items  ~70,000
--   payments     ~37,000  — new table, includes full and partial refunds
--   reviews      ~7,000
--
-- New columns / tables for Intermediate topics:
--   customers.time_zone   → time-zone practice            (Module 27)
--   books.description     → text search / regex practice (Modules 26, 46)
--   books.details (jsonb) → JSON practice                 (Module 28)
--   books.tags (text[])   → array practice                (Module 29)
--   payments              → reporting, transactions       (Modules 23, 30)
--   raw_customer_import   → MESSY imported data to clean, de-duplicate
--                           and upsert into customers     (Modules 24–26)
--
-- The random data is "seeded", so everyone who runs this file gets
-- the same rows — handy if you compare answers with someone.
--
-- HOW TO RUN:   psql -f 03_bookstore_growth.sql
-- Takes a few seconds. To start over: run 02_bookstore.sql, then this.
-- =====================================================================

\set ON_ERROR_STOP on
\c bookstore

-- Safety check: don't load twice
SELECT count(*) > 20 AS stage3_already_loaded FROM customers \gset
\if :stage3_already_loaded
    \echo 'Stage 3 is already loaded. To reload: run 02_bookstore.sql first, then this file.'
    \quit
\endif

BEGIN;

-- setseed makes random() repeatable; \gset just hides its output
SELECT setseed(0.42) \gset

-- ---------------------------------------------------------------------
-- 1. New columns and tables
-- ---------------------------------------------------------------------
ALTER TABLE customers ADD COLUMN time_zone   text;
ALTER TABLE books     ADD COLUMN description text;
ALTER TABLE books     ADD COLUMN details     jsonb;
ALTER TABLE books     ADD COLUMN tags        text[] NOT NULL DEFAULT '{}';

CREATE TABLE payments (
    payment_id  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id    integer NOT NULL REFERENCES orders (order_id) ON DELETE CASCADE,
    kind        text    NOT NULL CHECK (kind IN ('payment', 'refund')),
    amount      numeric(10,2) NOT NULL,          -- refunds are negative
    method      text    NOT NULL CHECK (method IN ('card','paypal','bank_transfer','gift_card')),
    paid_at     timestamptz NOT NULL,
    CONSTRAINT payments_amount_sign CHECK (
        (kind = 'payment' AND amount > 0) OR (kind = 'refund' AND amount < 0))
);

-- Everything here is plain text on purpose: it's what a messy CSV
-- export from another system looks like.
CREATE TABLE raw_customer_import (
    row_no       integer,
    full_name    text,
    email        text,
    phone        text,
    signup_date  text,
    city         text,
    notes        text
);

-- ---------------------------------------------------------------------
-- 2. Fill in the new columns for the original 20 customers and 25 books
-- ---------------------------------------------------------------------
UPDATE customers SET time_zone = CASE city
    WHEN 'New York'      THEN 'America/New_York'
    WHEN 'London'        THEN 'Europe/London'
    WHEN 'Manchester'    THEN 'Europe/London'
    WHEN 'Madrid'        THEN 'Europe/Madrid'
    WHEN 'Mexico City'   THEN 'America/Mexico_City'
    WHEN 'Berlin'        THEN 'Europe/Berlin'
    WHEN 'Rome'          THEN 'Europe/Rome'
    WHEN 'São Paulo'     THEN 'America/Sao_Paulo'
    WHEN 'Tokyo'         THEN 'Asia/Tokyo'
    WHEN 'Seoul'         THEN 'Asia/Seoul'
    WHEN 'Sydney'        THEN 'Australia/Sydney'
    WHEN 'San Francisco' THEN 'America/Los_Angeles'
    WHEN 'Seattle'       THEN 'America/Los_Angeles'
    WHEN 'Chicago'       THEN 'America/Chicago'
    WHEN 'Mumbai'        THEN 'Asia/Kolkata'
    WHEN 'Paris'         THEN 'Europe/Paris'
    WHEN 'Toronto'       THEN 'America/Toronto'
    WHEN 'Dubai'         THEN 'Asia/Dubai'
    WHEN 'Prague'        THEN 'Europe/Prague'
END;

UPDATE books SET description = v.d
FROM (VALUES
 ( 1, 'A witty story of love, pride and social class in Regency England.'),
 ( 2, 'A matchmaking heroine learns she understands others less than she thinks.'),
 ( 3, 'A chilling vision of total state surveillance and the destruction of truth.'),
 ( 4, 'Farm animals overthrow their farmer, only to be ruled by pigs.'),
 ( 5, 'Bilbo Baggins joins a band of dwarves on a quest for dragon treasure.'),
 ( 6, 'Frodo sets out to destroy a ring of terrible power.'),
 ( 7, 'Politics, religion and giant sandworms on the desert planet Arrakis.'),
 ( 8, 'A mathematician predicts the fall of a galactic empire.'),
 ( 9, 'Linked stories about robots and the Three Laws of Robotics.'),
 (10, 'Detective Hercule Poirot solves a murder aboard a snowbound train.'),
 (11, 'Ten strangers are lured to an island and die one by one.'),
 (12, 'A scientist creates life and is haunted by his creation.'),
 (13, 'A haunted hotel and a family snowed in for the winter.'),
 (14, 'A shape-shifting evil terrorizes the children of a small town.'),
 (15, 'A boy crosses into a parallel world to save his dying mother.'),
 (16, 'A brief history of humankind, from hunter-gatherers to today.'),
 (17, 'Tiny changes in daily habits lead to remarkable results.'),
 (18, 'An angel and a demon team up to prevent the end of the world.'),
 (19, 'Old gods and new gods fight for the soul of America.'),
 (20, 'Death takes an apprentice, with hilarious consequences.'),
 (21, 'A heist story set in a world of ash, mist and metal magic.'),
 (22, 'Soldiers, scholars and storms on a war-torn world.'),
 (23, 'A memoir of growing up without school in rural Idaho.'),
 (24, 'An orphan governess and the mysterious Mr Rochester.'),
 (25, 'What happens to humankind when algorithms know us better than we do.')
) AS v(id, d)
WHERE books.book_id = v.id;

-- ---------------------------------------------------------------------
-- 3. More authors (ids 18–77)
-- ---------------------------------------------------------------------
INSERT INTO authors (first_name, last_name, birth_year, country)
SELECT
    (ARRAY['Anna','Marco','Keiko','Samuel','Leila','Victor','Ingrid','Tomas','Nadia','Rafael',
           'Clara','Hugo','Mei','Oscar','Selin','Pavel','Ruth','Kofi','Elif','Julian'])[1 + floor(random()*20)::int],
    (ARRAY['Hale','Moreau','Okafor','Lindgren','Varga','Ishikawa','Castillo','Byrne','Novak','Fischer',
           'Reyes','Ahmed','Kowalski','Laurent','Mensah','Holm','Bianchi','Duarte','Sato','Quinn'])[1 + floor(random()*20)::int],
    1935 + floor(random()*65)::int,
    (ARRAY['USA','UK','Canada','Ireland','France','Germany','Spain','Italy','Japan','Nigeria',
           'Sweden','Poland','Brazil','India','Australia'])[1 + floor(random()*15)::int]
FROM generate_series(1, 60);

-- ---------------------------------------------------------------------
-- 4. More books (ids 26–300)
-- ---------------------------------------------------------------------
INSERT INTO books (title, isbn, publisher_id, genre_id, published_year, price, pages, stock, created_at, description)
SELECT
    'The ' ||
    (ARRAY['Silent','Hidden','Broken','Golden','Last','Forgotten','Burning','Crimson','Endless','Distant',
           'Wild','Secret','Glass','Iron','Midnight','Winter','Hollow','Shattered','Bright','Lost'])[1 + floor(random()*20)::int]
    || ' ' ||
    (ARRAY['River','Garden','Kingdom','Mirror','Promise','Empire','Shadow','Harbor','Letter','Machine',
           'Forest','Crown','Island','Signal','Orchard','City','Storm','Library','Bridge','Voyage'])[1 + floor(random()*20)::int],
    '979-8' || lpad(g::text, 9, '0'),
    1 + floor(random()*5)::int,          -- publishers 1–5 (Blue Owl Press stays empty)
    1 + floor(random()*8)::int,          -- genres 1–8   (Poetry stays empty)
    1960 + floor(random()*66)::int,
    floor(6 + random()*24) + 0.99,       -- prices like 12.99
    120 + floor(random()*700)::int,
    floor(random()*60)::int,
    timestamptz '2023-01-01 00:00+00' + random() * interval '900 days',
    (ARRAY['A gripping tale of','An unforgettable journey through','A thoughtful exploration of',
           'A fast-paced adventure about','A quiet meditation on','A darkly funny story of'])[1 + floor(random()*6)::int]
    || ' ' ||
    (ARRAY['love and loss','power and betrayal','an unlikely friendship','survival in the wilderness',
           'time travel','a family secret','dragons and ancient magic','artificial intelligence',
           'a small-town murder','the history of science','life at sea','a stolen painting'])[1 + floor(random()*12)::int]
    || '.'
FROM generate_series(26, 300) AS g;

-- one main author per new book, ~12% also get a co-author
INSERT INTO book_authors (book_id, author_id, author_order)
SELECT book_id, 18 + floor(random()*60)::int, 1
FROM books WHERE book_id > 25;

INSERT INTO book_authors (book_id, author_id, author_order)
SELECT book_id, 18 + floor(random()*60)::int, 2
FROM books WHERE book_id > 25 AND random() < 0.12
ON CONFLICT DO NOTHING;

-- JSONB details: ebooks have no physical dimensions (a key that's sometimes missing)
UPDATE books b
SET details = jsonb_strip_nulls(jsonb_build_object(
        'format',   x.fmt,
        'language', CASE WHEN random() < 0.85 THEN 'en'
                         ELSE (ARRAY['es','fr','de','ja'])[1 + floor(random()*4)::int] END,
        'edition',  1 + floor(random()*4)::int,
        'dimensions_cm', CASE WHEN x.fmt <> 'ebook' THEN jsonb_build_object(
                             'height', round((18 + random()*6)::numeric, 1),
                             'width',  round((11 + random()*5)::numeric, 1)) END,
        'awards',   CASE WHEN random() < 0.12
                         THEN jsonb_build_array((ARRAY['Hugo Award','Booker Prize','Edgar Award',
                                                      'Nebula Award','Costa Book Award'])[1 + floor(random()*5)::int])
                         ELSE '[]'::jsonb END
    ))
FROM (SELECT book_id,
             (ARRAY['paperback','paperback','hardcover','ebook'])[1 + floor(random()*4)::int] AS fmt
      FROM books) AS x
WHERE b.book_id = x.book_id;

-- tags: 0–3 labels per book
UPDATE books b
SET tags = ARRAY(
    SELECT t
    FROM unnest(ARRAY['bestseller','staff-pick','award-winner','new-release','signed-copy','book-club']) AS t
    WHERE random() < 0.18 AND b.book_id IS NOT NULL      -- (b.book_id makes it re-run per book)
);

-- ---------------------------------------------------------------------
-- 5. More customers (ids 21–5020)
-- ---------------------------------------------------------------------
WITH loc (i, city, country, tz) AS (VALUES
    ( 1,'New York','USA','America/New_York'),      ( 2,'New York','USA','America/New_York'),
    ( 3,'Chicago','USA','America/Chicago'),        ( 4,'Los Angeles','USA','America/Los_Angeles'),
    ( 5,'Seattle','USA','America/Los_Angeles'),    ( 6,'Austin','USA','America/Chicago'),
    ( 7,'Toronto','Canada','America/Toronto'),     ( 8,'London','UK','Europe/London'),
    ( 9,'London','UK','Europe/London'),            (10,'Manchester','UK','Europe/London'),
    (11,'Berlin','Germany','Europe/Berlin'),       (12,'Paris','France','Europe/Paris'),
    (13,'Madrid','Spain','Europe/Madrid'),         (14,'Rome','Italy','Europe/Rome'),
    (15,'Mexico City','Mexico','America/Mexico_City'), (16,'São Paulo','Brazil','America/Sao_Paulo'),
    (17,'Tokyo','Japan','Asia/Tokyo'),             (18,'Seoul','South Korea','Asia/Seoul'),
    (19,'Mumbai','India','Asia/Kolkata'),          (20,'Bangalore','India','Asia/Kolkata'),
    (21,'Sydney','Australia','Australia/Sydney'),  (22,'Dubai','UAE','Asia/Dubai'),
    (23,'Prague','Czechia','Europe/Prague'),       (24,'Singapore','Singapore','Asia/Singapore')
),
people AS (
    SELECT g,
        (ARRAY['Emma','Liam','Olivia','Noah','Ava','Lucas','Sophia','Mateo','Mia','Ethan',
               'Isabella','James','Amelia','Arjun','Chloe','Benjamin','Harper','Aisha','Daniel','Zoe',
               'Oliver','Charlotte','Henry','Amara','Leo','Nora','Samuel','Yuki','Hana','Diego',
               'Elena','Omar','Fatima','Ravi','Priya','Jack','Grace','Wei','Lina','Tomas'])[1 + floor(random()*40)::int] AS fn,
        (ARRAY['Smith','Johnson','Brown','Garcia','Martinez','Mueller','Rossi','Silva','Tanaka','Kim',
               'Nguyen','Wilson','Taylor','Patel','Dubois','Lee','Anderson','Khan','Novak','Clarke',
               'Lopez','Walker','Young','Hernandez','King','Wright','Scott','Green','Baker','Adams',
               'Nelson','Hill','Campbell','Mitchell','Roberts','Carter','Phillips','Evans','Turner','Sato'])[1 + floor(random()*40)::int] AS ln,
        1 + floor(random()*24)::int AS li,
        timestamptz '2023-01-01 00:00+00' + random() * interval '1247 days' AS joined
    FROM generate_series(21, 5020) AS g
)
INSERT INTO customers (first_name, last_name, email, city, country, time_zone, joined_at)
SELECT p.fn, p.ln,
       lower(p.fn || '.' || p.ln || p.g || '@example.com'),
       CASE WHEN random() < 0.02 THEN NULL ELSE loc.city END,     -- a few missing cities
       loc.country, loc.tz, p.joined
FROM people p
JOIN loc ON loc.i = p.li
ORDER BY p.g;

-- a few more one-to-one profiles
INSERT INTO customer_profiles (customer_id, bio, favorite_genre_id, newsletter)
SELECT customer_id,
       CASE WHEN random() < 0.4 THEN 'Loves ' || lower(g.name) || ' books.' END,
       g.genre_id,
       random() < 0.5
FROM customers c
JOIN genres g ON g.genre_id = 1 + (c.customer_id % 8)
WHERE c.customer_id > 20 AND random() < 0.25;

-- ---------------------------------------------------------------------
-- 6. Orders (~39,000). A few customers buy a lot, most buy a little.
--    Order dates always fall after the customer joined.
-- ---------------------------------------------------------------------
CREATE TEMP TABLE new_orders AS
SELECT c.customer_id,
       c.joined_at + random() * (timestamptz '2026-06-30 23:59+00' - c.joined_at) AS ordered_at
FROM (SELECT 1 + floor(power(random(), 1.6) * 5020)::int AS cid
      FROM generate_series(1, 36000)) AS r
JOIN customers c ON c.customer_id = r.cid;

-- holiday rush: extra orders in November/December
INSERT INTO new_orders (customer_id, ordered_at)
SELECT c.customer_id, x.t
FROM (SELECT 1 + floor(random() * 5020)::int AS cid,
             (ARRAY[timestamptz '2023-11-01 00:00+00',
                    timestamptz '2024-11-01 00:00+00',
                    timestamptz '2025-11-01 00:00+00'])[1 + floor(random()*3)::int]
               + random() * interval '60 days' AS t
      FROM generate_series(1, 6000)) AS x
JOIN customers c ON c.customer_id = x.cid
WHERE x.t > c.joined_at;

INSERT INTO orders (customer_id, employee_id, ordered_at, status)
SELECT customer_id,
       CASE WHEN random() < 0.15 THEN 4 + floor(random()*3)::int END,   -- 15% in-store sales
       ordered_at,
       CASE
         WHEN ordered_at < timestamptz '2026-06-01 00:00+00' THEN
              CASE WHEN random() < 0.05 THEN 'cancelled' ELSE 'delivered' END
         ELSE (ARRAY['pending','paid','shipped','shipped','delivered','cancelled'])[1 + floor(random()*6)::int]
       END
FROM new_orders
ORDER BY ordered_at;               -- ids increase with time, like a real system

-- ---------------------------------------------------------------------
-- 7. Order lines: 1–4 books per order; famous books sell far more often
-- ---------------------------------------------------------------------
INSERT INTO order_items (order_id, book_id, quantity, unit_price)
SELECT o.order_id,
       b.book_id,
       CASE WHEN random() < 0.1 THEN 2 + floor(random()*2)::int ELSE 1 END,
       CASE WHEN random() < 0.1 THEN round(b.price * 0.9, 2) ELSE b.price END   -- 10% of lines discounted
FROM orders o
CROSS JOIN LATERAL generate_series(1, 1 + floor(power(random(), 2.5) * 4)::int + 0 * o.order_id) AS s(n)
CROSS JOIN LATERAL (SELECT 1 + floor(power(random(), 1.4) * 300)::int + 0 * s.n AS book_id) AS pick
JOIN books b ON b.book_id = pick.book_id
WHERE o.order_id > 30
ON CONFLICT (order_id, book_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 8. Payments for every paid / shipped / delivered order, then refunds
-- ---------------------------------------------------------------------
INSERT INTO payments (order_id, kind, amount, method, paid_at)
SELECT o.order_id, 'payment', t.total,
       (ARRAY['card','card','card','paypal','paypal','bank_transfer','gift_card'])[1 + floor(random()*7)::int],
       o.ordered_at + random() * interval '30 minutes'
FROM orders o
JOIN (SELECT order_id, sum(quantity * unit_price) AS total
      FROM order_items GROUP BY order_id) AS t ON t.order_id = o.order_id
WHERE o.status IN ('paid', 'shipped', 'delivered')
ORDER BY o.ordered_at;

INSERT INTO payments (order_id, kind, amount, method, paid_at)
SELECT p.order_id, 'refund', -p.amount, p.method,
       p.paid_at + interval '3 days' + random() * interval '25 days'
FROM payments p
JOIN orders o ON o.order_id = p.order_id
WHERE o.status = 'delivered' AND p.kind = 'payment' AND random() < 0.02;

-- ---------------------------------------------------------------------
-- 9. Reviews: some customers review books they received
-- ---------------------------------------------------------------------
INSERT INTO reviews (book_id, customer_id, rating, comment, created_at)
SELECT oi.book_id, o.customer_id, r.rating,
       CASE WHEN random() < 0.45 THEN NULL
            WHEN r.rating >= 4 THEN (ARRAY['Loved it!','Could not put it down.','Highly recommended.',
                                           'A new favourite.','Great gift idea.'])[1 + floor(random()*5)::int]
            WHEN r.rating = 3  THEN (ARRAY['It was okay.','Good but slow in places.','Mixed feelings.'])[1 + floor(random()*3)::int]
            ELSE (ARRAY['Not for me.','Disappointing ending.','Arrived damaged.','Too long.'])[1 + floor(random()*4)::int]
       END,
       least(o.ordered_at + interval '3 days' + random() * interval '60 days', timestamptz '2026-06-30 23:00+00')
FROM order_items oi
JOIN orders o ON o.order_id = oi.order_id
CROSS JOIN LATERAL (
    SELECT CASE WHEN x < 0.40 THEN 5 WHEN x < 0.70 THEN 4 WHEN x < 0.85 THEN 3
                WHEN x < 0.93 THEN 2 ELSE 1 END AS rating
    FROM (SELECT random() + 0 * oi.book_id AS x) AS rnd
) AS r
WHERE o.status = 'delivered' AND o.order_id > 30 AND random() < 0.12
ON CONFLICT (book_id, customer_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 10. Messy import file (310 rows) to clean up and merge into customers.
--     About 1 in 6 rows are EXISTING customers (so you can practise
--     upserts) and there are some exact and near duplicates.
-- ---------------------------------------------------------------------
INSERT INTO raw_customer_import (row_no, full_name, email, phone, signup_date, city, notes)
SELECT g,
       CASE floor(random()*4)::int
            WHEN 0 THEN upper(p.fn || ' ' || p.ln)
            WHEN 1 THEN lower(p.fn || ' ' || p.ln)
            WHEN 2 THEN '  ' || p.fn || '  ' || p.ln || ' '
            ELSE p.fn || ' ' || p.ln END,
       CASE WHEN random() < 0.05 THEN NULL
            WHEN random() < 0.05 THEN replace(p.em, '@', ' at ')              -- invalid email
            WHEN random() < 0.30 THEN upper(p.em)
            WHEN random() < 0.10 THEN ' ' || p.em || ' '
            ELSE p.em END,
       CASE floor(random()*7)::int
            WHEN 0 THEN '(' || p.a || ') ' || p.b || '-' || p.c
            WHEN 1 THEN p.a || '.' || p.b || '.' || p.c
            WHEN 2 THEN '+1 ' || p.a || ' ' || p.b || ' ' || p.c
            WHEN 3 THEN p.a || p.b || p.c
            WHEN 4 THEN p.a || '-' || p.b || '-' || p.c
            WHEN 5 THEN ''
            ELSE NULL END,
       CASE floor(random()*6)::int
            WHEN 0 THEN to_char(p.d, 'YYYY-MM-DD')
            WHEN 1 THEN to_char(p.d, 'DD/MM/YYYY')
            WHEN 2 THEN to_char(p.d, 'FMMonth FMDD, YYYY')
            WHEN 3 THEN to_char(p.d, 'YYYY/MM/DD')
            WHEN 4 THEN to_char(p.d, 'YYYY-MM-DD')
            ELSE '' END,
       (ARRAY['new york','New York','NYC','London','london ','Berlin','BERLIN','Paris','Tokyo',
              'Toronto',' Sydney','Mumbai',NULL,''])[1 + floor(random()*14)::int],
       (ARRAY[NULL, NULL, NULL, 'VIP', 'call before shipping', 'wholesale?', 'duplicate?', 'N/A'])[1 + floor(random()*8)::int]
FROM (
    SELECT g,
           CASE WHEN g % 6 = 0 THEN c.first_name ELSE n.fn END AS fn,
           CASE WHEN g % 6 = 0 THEN c.last_name  ELSE n.ln END AS ln,
           CASE WHEN g % 6 = 0 THEN c.email
                ELSE lower(n.fn || '.' || n.ln || '.import' || (g % 250) || '@example.org') END AS em,
           lpad((200 + floor(random()*700))::int::text, 3, '0') AS a,
           lpad((100 + floor(random()*900))::int::text, 3, '0') AS b,
           lpad(floor(random()*10000)::int::text, 4, '0')       AS c,
           date '2025-01-01' + floor(random()*540)::int         AS d
    FROM generate_series(1, 300) AS g
    CROSS JOIN LATERAL (
        SELECT (ARRAY['Maya','Felix','Iris','Jonas','Layla','Tariq','Sofia','Ben','Ruby','Kai'])[1 + floor(random()*10)::int] AS fn,
               (ARRAY['Hart','Ortega','Singh','Berg','Costa','Ito','Murphy','Klein','Ali','Weber'])[1 + floor(random()*10)::int] AS ln,
               0 * g AS dummy
    ) AS n
    LEFT JOIN customers c ON c.customer_id = 1 + (g * 37) % 5020
) AS p;

-- duplicates: 10 rows appear twice, once with different capitalization
INSERT INTO raw_customer_import (row_no, full_name, email, phone, signup_date, city, notes)
SELECT 300 + row_number() OVER (ORDER BY row_no),
       full_name,
       CASE WHEN row_no % 2 = 0 THEN upper(email) ELSE email END,
       phone, signup_date, city, notes
FROM raw_customer_import
WHERE row_no % 29 = 0;

-- ---------------------------------------------------------------------
-- 11. Partial refunds (a damaged copy, a late delivery): about 1% of
--     delivered orders that weren't fully refunded get part of their money back.
--     Kept near the end so the random rows above stay exactly the same.
-- ---------------------------------------------------------------------
INSERT INTO payments (order_id, kind, amount, method, paid_at)
SELECT p.order_id, 'refund', -round(p.amount * (0.2 + random() * 0.5)::numeric, 2), p.method,
       p.paid_at + interval '5 days' + random() * interval '20 days'
FROM payments p
JOIN orders o ON o.order_id = p.order_id
WHERE o.status = 'delivered' AND p.kind = 'payment'
  AND NOT EXISTS (SELECT 1 FROM payments r WHERE r.order_id = p.order_id AND r.kind = 'refund')
  AND random() < 0.01
ORDER BY p.paid_at;

-- ---------------------------------------------------------------------
-- 12. Random word pairs sometimes repeat. Real shops do sell series, so a
--     repeated title becomes the next book in that series: "The Iron Crown, Book 2".
-- ---------------------------------------------------------------------
UPDATE books b
SET title = b.title || ', Book ' || d.n
FROM (SELECT book_id, row_number() OVER (PARTITION BY title ORDER BY book_id) AS n
      FROM books) AS d
WHERE d.book_id = b.book_id AND d.n > 1;

COMMIT;

DROP TABLE new_orders;
ANALYZE;

\echo ''
\echo 'Stage 3 loaded. Row counts:'
SELECT 'authors' AS table_name, count(*) AS rows FROM authors
UNION ALL SELECT 'books',               count(*) FROM books
UNION ALL SELECT 'customers',           count(*) FROM customers
UNION ALL SELECT 'orders',              count(*) FROM orders
UNION ALL SELECT 'order_items',         count(*) FROM order_items
UNION ALL SELECT 'payments',            count(*) FROM payments
UNION ALL SELECT 'reviews',             count(*) FROM reviews
UNION ALL SELECT 'raw_customer_import', count(*) FROM raw_customer_import;
