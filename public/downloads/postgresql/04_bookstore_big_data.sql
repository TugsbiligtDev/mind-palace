-- =====================================================================
-- STAGE 4 — BIG DATA FOR PERFORMANCE WORK   (Roadmap Advanced level,
--                                             Modules 40–46)
-- Database: bookstore   (REQUIRES Stages 2 and 3)
--
-- Adds one large table:
--
--   events  – 2,000,000 website events (page views, searches,
--             add-to-cart, purchases) from Jan 2024 to Jun 2026,
--             stored in time order like a real log.
--
-- It has ONLY a primary key — no other indexes — on purpose.
-- Your job in the Advanced modules: measure slow queries with
-- EXPLAIN ANALYZE, add the right indexes, try partitioning (Module 44),
-- and watch vacuum at work (Module 43).
--
-- There are also no foreign keys, which is common for high-volume
-- log tables (it keeps inserts fast).
--
-- HOW TO RUN:   psql -f 04_bookstore_big_data.sql
--   Want a different size? e.g. 5 million rows:
--                psql -v rows=5000000 -f 04_bookstore_big_data.sql
-- Takes roughly 10–30 seconds on an M2 Mac and ~200 MB of disk
-- per 2 million rows. Re-running this file rebuilds the events table.
-- =====================================================================

\set ON_ERROR_STOP on
\if :{?rows}
\else
    \set rows 2000000
\endif

\c bookstore

SELECT count(*) > 20 AS stage3_loaded FROM customers \gset
\if :stage3_loaded
\else
    \echo 'Please load 03_bookstore_growth.sql first.'
    \quit
\endif

DROP TABLE IF EXISTS events;

CREATE TABLE events (
    event_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at  timestamptz NOT NULL,
    session_id   bigint      NOT NULL,
    customer_id  integer,              -- NULL = visitor not logged in
    book_id      integer,              -- NULL for searches
    event_type   text        NOT NULL, -- page_view | search | add_to_cart | purchase
    device       text        NOT NULL, -- mobile | desktop | tablet
    search_term  text                  -- only for searches (with real-life typos)
);

SELECT setseed(0.7) \gset

\echo 'Generating events… (this is the slow part)'

INSERT INTO events (occurred_at, session_id, customer_id, book_id, event_type, device, search_term)
SELECT
    -- spread evenly across the period, in time order, with a little jitter
    timestamptz '2024-01-01 00:00+00'
        + (g::float8 / :rows) * interval '911 days'
        + random() * interval '2 minutes',
    g / 6,                                                            -- ~6 events per session
    CASE WHEN random() < 0.6 THEN 1 + floor(power(random(), 1.6) * 5020)::int END,
    CASE WHEN t.event_type = 'search' THEN NULL
         ELSE 1 + floor(power(random(), 1.4) * 300)::int END,
    t.event_type,
    (ARRAY['mobile','mobile','mobile','desktop','desktop','tablet'])[1 + floor(random()*6)::int],
    CASE WHEN t.event_type = 'search' THEN
         (ARRAY['dune','Dune','stephen king','steven king','harry poter','sci fi','science fiction',
                'mystery','agatha christie','fantasy books','atomic habits','sapiens','romance',
                'the hobbit','tolkein','gift ideas','horror','best sellers','new releases',
                'brandon sanderson'])[1 + floor(random()*20)::int]
    END
FROM generate_series(1, :rows) AS g
CROSS JOIN LATERAL (
    SELECT CASE WHEN x < 0.70 THEN 'page_view'
                WHEN x < 0.85 THEN 'search'
                WHEN x < 0.95 THEN 'add_to_cart'
                ELSE 'purchase' END AS event_type
    FROM (SELECT random() + 0 * g AS x) AS r
) AS t;

VACUUM ANALYZE events;

\echo ''
\echo 'Stage 4 loaded:'
SELECT count(*)                                         AS event_rows,
       min(occurred_at)::date                           AS first_day,
       max(occurred_at)::date                           AS last_day,
       pg_size_pretty(pg_total_relation_size('events')) AS size_on_disk
FROM events;
