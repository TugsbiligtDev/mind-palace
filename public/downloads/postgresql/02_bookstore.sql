-- =====================================================================
-- STAGE 2 — THE BOOKSTORE (relational design)   (Roadmap Modules 11–17
--                                                and all of Beginner level)
-- Database: bookstore
--
-- A small but properly designed online bookstore, with primary keys,
-- foreign keys, constraints and every common relationship type:
--
--   one-to-many   publishers → books,  genres → books,
--                 customers → orders,  orders → order_items
--   many-to-many  books ↔ authors      (through book_authors)
--   one-to-one    customers ↔ customer_profiles
--   self-reference employees → employees (manager_id)
--
-- Built-in "gaps" for LEFT JOIN / NOT EXISTS practice:
--   * a publisher with no books        (Blue Owl Press)
--   * an author with no books          (Mira Castellanos)
--   * a genre with no books            (Poetry)
--   * books never ordered              (I, Robot; Homo Deus)
--   * customers who never ordered      (Harper, Daniel, Zoe)
--   * books with no reviews
--
-- ID numbers are generated automatically (GENERATED ALWAYS AS IDENTITY).
-- On a fresh load they always come out as 1, 2, 3 … in the order below,
-- which is why the INSERTs further down can refer to them by number.
--
-- NOTE: the foreign-key columns deliberately have NO indexes yet.
-- Adding them is one of your exercises (Module 13 / Module 32).
--
-- HOW TO RUN:   psql -f 02_bookstore.sql
-- Connect with: psql -d bookstore
-- Re-running this file RESETS the whole bookstore database
-- (including anything Stage 3 or Stage 4 added).
-- =====================================================================

DROP DATABASE IF EXISTS bookstore;
CREATE DATABASE bookstore;
\c bookstore

-- ---------------------------------------------------------------------
-- Lookup / parent tables
-- ---------------------------------------------------------------------
CREATE TABLE publishers (
    publisher_id  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          text    NOT NULL UNIQUE,
    country       text,
    founded_year  integer CHECK (founded_year BETWEEN 1400 AND 2100)
);

CREATE TABLE genres (
    genre_id  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name      text    NOT NULL UNIQUE
);

CREATE TABLE authors (
    author_id   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name  text,
    last_name   text    NOT NULL,
    birth_year  integer,
    country     text
);

-- ---------------------------------------------------------------------
-- books  (child of publishers and genres)
-- ---------------------------------------------------------------------
CREATE TABLE books (
    book_id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title           text    NOT NULL,
    isbn            text    UNIQUE,
    publisher_id    integer REFERENCES publishers (publisher_id) ON DELETE SET NULL,
    genre_id        integer NOT NULL REFERENCES genres (genre_id) ON DELETE RESTRICT,
    published_year  integer,
    price           numeric(8,2) NOT NULL CHECK (price >= 0),
    pages           integer CHECK (pages > 0),
    stock           integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- many-to-many: a book can have several authors, an author several books
CREATE TABLE book_authors (
    book_id       integer  NOT NULL REFERENCES books (book_id)     ON DELETE CASCADE,
    author_id     integer  NOT NULL REFERENCES authors (author_id) ON DELETE RESTRICT,
    author_order  smallint NOT NULL DEFAULT 1,   -- 1 = main author, 2 = co-author …
    PRIMARY KEY (book_id, author_id)             -- composite primary key
);

-- ---------------------------------------------------------------------
-- customers and their optional profile (one-to-one)
-- ---------------------------------------------------------------------
CREATE TABLE customers (
    customer_id  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name   text NOT NULL,
    last_name    text NOT NULL,
    email        text NOT NULL UNIQUE,
    city         text,
    country      text,
    joined_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customer_profiles (
    customer_id        integer PRIMARY KEY               -- PK + FK = one-to-one
                       REFERENCES customers (customer_id) ON DELETE CASCADE,
    bio                text,
    favorite_genre_id  integer REFERENCES genres (genre_id),
    newsletter         boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------
-- employees (self-referencing: every employee may have a manager)
-- ---------------------------------------------------------------------
CREATE TABLE employees (
    employee_id  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name    text    NOT NULL,
    job_title    text    NOT NULL,
    manager_id   integer REFERENCES employees (employee_id) ON DELETE SET NULL,
    hired_on     date    NOT NULL,
    salary       numeric(10,2) CHECK (salary > 0)
);

-- ---------------------------------------------------------------------
-- orders and order lines
-- ---------------------------------------------------------------------
CREATE TABLE orders (
    order_id     integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id  integer NOT NULL REFERENCES customers (customer_id) ON DELETE RESTRICT,
    employee_id  integer REFERENCES employees (employee_id) ON DELETE SET NULL,  -- NULL = online order
    ordered_at   timestamptz NOT NULL DEFAULT now(),
    status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','paid','shipped','delivered','cancelled'))
);

CREATE TABLE order_items (
    order_id    integer NOT NULL REFERENCES orders (order_id) ON DELETE CASCADE,
    book_id     integer NOT NULL REFERENCES books (book_id)   ON DELETE RESTRICT,
    quantity    integer NOT NULL CHECK (quantity > 0),
    unit_price  numeric(8,2) NOT NULL CHECK (unit_price >= 0), -- price at time of sale
    PRIMARY KEY (order_id, book_id)
);

-- ---------------------------------------------------------------------
-- reviews (one review per customer per book)
-- ---------------------------------------------------------------------
CREATE TABLE reviews (
    review_id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    book_id      integer NOT NULL REFERENCES books (book_id)         ON DELETE CASCADE,
    customer_id  integer NOT NULL REFERENCES customers (customer_id) ON DELETE CASCADE,
    rating       smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment      text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (book_id, customer_id)
);

-- =====================================================================
-- DATA
-- =====================================================================

INSERT INTO publishers (name, country, founded_year) VALUES
('Penguin Classics', 'UK',     1946),   -- 1
('HarperCollins',    'USA',    1989),   -- 2
('Tor Books',        'USA',    1980),   -- 3
('Vintage Books',    'USA',    1954),   -- 4
('Bloomsbury',       'UK',     1986),   -- 5
('Blue Owl Press',   'Canada', 2021);   -- 6  (no books yet)

INSERT INTO genres (name) VALUES
('Classic'),          -- 1
('Science Fiction'),  -- 2
('Fantasy'),          -- 3
('Mystery'),          -- 4
('Horror'),           -- 5
('Non-Fiction'),      -- 6
('Self-Help'),        -- 7
('Romance'),          -- 8
('Poetry');           -- 9  (no books yet)

INSERT INTO authors (first_name, last_name, birth_year, country) VALUES
('Jane',        'Austen',      1775, 'UK'),      -- 1
('George',      'Orwell',      1903, 'UK'),      -- 2
('J.R.R.',      'Tolkien',     1892, 'UK'),      -- 3
('Frank',       'Herbert',     1920, 'USA'),     -- 4
('Isaac',       'Asimov',      1920, 'USA'),     -- 5
('Agatha',      'Christie',    1890, 'UK'),      -- 6
('Mary',        'Shelley',     1797, 'UK'),      -- 7
('Stephen',     'King',        1947, 'USA'),     -- 8
('Yuval Noah',  'Harari',      1976, 'Israel'),  -- 9
('James',       'Clear',       1986, 'USA'),     -- 10
('Terry',       'Pratchett',   1948, 'UK'),      -- 11
('Neil',        'Gaiman',      1960, 'UK'),      -- 12
('Brandon',     'Sanderson',   1975, 'USA'),     -- 13
('Tara',        'Westover',    1986, 'USA'),     -- 14
('Charlotte',   'Bronte',      1816, 'UK'),      -- 15
('Mira',        'Castellanos', 1990, 'Spain'),   -- 16 (no books yet)
('Peter',       'Straub',      1943, 'USA');     -- 17

INSERT INTO books (title, isbn, publisher_id, genre_id, published_year, price, pages, stock, created_at) VALUES
('Pride and Prejudice',           '978-0141439518', 1, 1, 1813,  9.99,  432, 25, '2024-01-15 10:30+00'),  -- 1
('Emma',                          '978-0141439587', 1, 1, 1815,  8.99,  474, 12, '2024-01-15 10:32+00'),  -- 2
('1984',                          '978-0451524935', 1, 2, 1949, 12.50,  328, 40, '2024-01-20 09:00+00'),  -- 3
('Animal Farm',                   '978-0451526342', 1, 1, 1945,  7.99,  112, 33, '2024-01-20 09:05+00'),  -- 4
('The Hobbit',                    '978-0547928227', 2, 3, 1937, 14.99,  310, 18, '2024-02-01 14:00+00'),  -- 5
('The Fellowship of the Ring',    '978-0547928210', 2, 3, 1954, 16.99,  423,  9, '2024-02-01 14:10+00'),  -- 6
('Dune',                          '978-0441172719', 3, 2, 1965, 18.00,  688, 22, '2024-02-10 11:45+00'),  -- 7
('Foundation',                    '978-0553293357', 4, 2, 1951, 11.25,  255,  0, '2024-02-10 12:00+00'),  -- 8
('I, Robot',                      '978-0553382563', 4, 2, 1950,  9.50,  253,  7, '2024-02-11 08:20+00'),  -- 9
('Murder on the Orient Express',  '978-0062693662', 2, 4, 1934, 10.99,  256, 14, '2024-03-05 16:00+00'),  -- 10
('And Then There Were None',      '978-0062073488', 2, 4, 1939, 10.99,  272, 20, '2024-03-05 16:05+00'),  -- 11
('Frankenstein',                  '978-0141439471', 1, 5, 1818,  7.50,  280, 11, '2024-03-15 13:30+00'),  -- 12
('The Shining',                   '978-0307743657', 4, 5, 1977, 15.99,  688, 16, '2024-04-02 09:15+00'),  -- 13
('It',                            '978-1501142970', 4, 5, 1986, 19.99, 1138,  4, '2024-04-02 09:20+00'),  -- 14
('The Talisman',                  '978-1501192272', 4, 3, 1984, 17.50,  944,  6, '2024-04-02 09:25+00'),  -- 15
('Sapiens',                       '978-0062316097', 2, 6, 2011, 22.00,  443, 30, '2024-04-18 17:00+00'),  -- 16
('Atomic Habits',                 '978-0735211292', 2, 7, 2018, 16.20,  320, 45, '2024-05-01 08:00+00'),  -- 17
('Good Omens',                    '978-0060853983', 2, 3, 1990, 13.99,  412, 17, '2024-05-10 10:00+00'),  -- 18
('American Gods',                 '978-0063081918', 2, 3, 2001, 15.50,  635, 10, '2024-05-10 10:05+00'),  -- 19
('Mort',                          '978-0062225719', 2, 3, 1987,  9.99,  272, 13, '2024-05-10 10:10+00'),  -- 20
('Mistborn: The Final Empire',    '978-0765350381', 3, 3, 2006, 11.99,  541, 21, '2024-07-07 19:40+00'),  -- 21
('The Way of Kings',              '978-0765326355', 3, 3, 2010, 21.99, 1007,  8, '2024-07-07 19:45+00'),  -- 22
('Educated',                      '978-0399590504', 4, 6, 2018, 15.00,  352, 12, '2024-08-20 10:00+00'),  -- 23
('Jane Eyre',                     '978-0141441146', 1, 8, 1847,  8.50,  532, 10, '2024-05-20 12:00+00'),  -- 24
('Homo Deus',                     '978-0062464316', 2, 6, 2015, 18.50,  450,  0, '2024-09-01 09:00+00');  -- 25

INSERT INTO book_authors (book_id, author_id, author_order) VALUES
( 1, 1, 1), ( 2, 1, 1), ( 3, 2, 1), ( 4, 2, 1), ( 5, 3, 1), ( 6, 3, 1),
( 7, 4, 1), ( 8, 5, 1), ( 9, 5, 1), (10, 6, 1), (11, 6, 1), (12, 7, 1),
(13, 8, 1), (14, 8, 1),
(15, 8, 1), (15, 17, 2),          -- The Talisman: Stephen King + Peter Straub
(16, 9, 1), (17, 10, 1),
(18, 11, 1), (18, 12, 2),         -- Good Omens: Terry Pratchett + Neil Gaiman
(19, 12, 1), (20, 11, 1), (21, 13, 1), (22, 13, 1), (23, 14, 1), (24, 15, 1),
(25, 9, 1);

INSERT INTO customers (first_name, last_name, email, city, country, joined_at) VALUES
('Emma',     'Johnson',  'emma.johnson@example.com',    'New York',      'USA',         '2024-01-10 09:15+00'),  -- 1
('Liam',     'Smith',    'liam.smith@example.com',      'London',        'UK',          '2024-01-22 18:40+00'),  -- 2
('Olivia',   'Brown',    'olivia.brown@example.com',    'Manchester',    'UK',          '2024-02-05 12:00+00'),  -- 3
('Noah',     'Garcia',   'noah.garcia@example.com',     'Madrid',        'Spain',       '2024-02-18 08:30+00'),  -- 4
('Ava',      'Martinez', 'ava.martinez@example.com',    'Mexico City',   'Mexico',      '2024-03-01 21:05+00'),  -- 5
('Lucas',    'Müller',   'lucas.mueller@example.com',   'Berlin',        'Germany',     '2024-03-12 07:45+00'),  -- 6
('Sophia',   'Rossi',    'sophia.rossi@example.com',    'Rome',          'Italy',       '2024-03-28 15:20+00'),  -- 7
('Mateo',    'Silva',    'mateo.silva@example.com',     'São Paulo',     'Brazil',      '2024-04-09 13:10+00'),  -- 8
('Mia',      'Tanaka',   'mia.tanaka@example.com',      'Tokyo',         'Japan',       '2024-04-03 02:00+00'),  -- 9
('Ethan',    'Kim',      'ethan.kim@example.com',       'Seoul',         'South Korea', '2024-05-14 05:55+00'),  -- 10
('Isabella', 'Nguyen',   'isabella.nguyen@example.com', 'Sydney',        'Australia',   '2024-05-29 23:30+00'),  -- 11
('James',    'Wilson',   'james.wilson@example.com',    'San Francisco', 'USA',         '2024-04-11 17:00+00'),  -- 12
('Amelia',   'Taylor',   'amelia.taylor@example.com',   'Chicago',       'USA',         '2024-06-25 14:25+00'),  -- 13
('Arjun',    'Patel',    'arjun.patel@example.com',     'Mumbai',        'India',       '2024-07-08 06:40+00'),  -- 14
('Chloe',    'Dubois',   'chloe.dubois@example.com',    'Paris',         'France',      '2024-05-19 10:10+00'),  -- 15
('Benjamin', 'Lee',      'benjamin.lee@example.com',    'Toronto',       'Canada',      '2024-08-02 16:50+00'),  -- 16
('Harper',   'Anderson', 'harper.anderson@example.com', 'Seattle',       'USA',         '2024-08-21 20:15+00'),  -- 17 (no orders)
('Aisha',    'Khan',     'aisha.khan@example.com',      'Dubai',         'UAE',         '2024-06-03 09:00+00'),  -- 18
('Daniel',   'Novak',    'daniel.novak@example.com',    'Prague',        'Czechia',     '2024-09-17 11:35+00'),  -- 19 (no orders)
('Zoe',      'Clarke',   'zoe.clarke@example.com',      'London',        'UK',          '2024-10-01 19:45+00');  -- 20 (no orders)

INSERT INTO customer_profiles (customer_id, bio, favorite_genre_id, newsletter) VALUES
( 1, 'Book club organizer in Brooklyn.',   1, true),
( 4, NULL,                                 2, false),
( 8, 'History nerd.',                      6, true),
(12, 'Reads on every flight.',             2, true),
(15, 'Collector of old editions.',         8, false),
(18, NULL,                                 7, true);

INSERT INTO employees (full_name, job_title, manager_id, hired_on, salary) VALUES
('Helen Carter',   'CEO',                 NULL, '2019-03-01', 150000),  -- 1
('Marcus Reed',    'Head of Sales',       1,    '2020-01-15',  95000),  -- 2
('Priya Sharma',   'Head of Operations',  1,    '2020-06-01',  92000),  -- 3
('Tom Becker',     'Sales Associate',     2,    '2022-04-10',  48000),  -- 4
('Sara Lindqvist', 'Sales Associate',     2,    '2023-02-20',  46000),  -- 5
('Kenji Mori',     'Sales Associate',     2,    '2024-01-08',  45000),  -- 6
('Lena Ortiz',     'Warehouse Lead',      3,    '2021-09-13',  52000),  -- 7
('Omar Haddad',    'Warehouse Assistant', 7,    '2024-05-06',  38000);  -- 8

INSERT INTO orders (customer_id, employee_id, ordered_at, status) VALUES
( 1, 4,    '2024-02-03 10:05+00', 'delivered'),  -- 1
( 2, NULL, '2024-02-20 17:30+00', 'delivered'),  -- 2
( 4, 5,    '2024-03-02 09:00+00', 'delivered'),  -- 3
( 1, NULL, '2024-03-15 20:45+00', 'delivered'),  -- 4
( 6, 4,    '2024-04-01 12:00+00', 'delivered'),  -- 5
( 8, NULL, '2024-04-10 08:15+00', 'delivered'),  -- 6
( 9, NULL, '2024-04-22 16:40+00', 'delivered'),  -- 7
(12, 6,    '2024-05-05 11:11+00', 'delivered'),  -- 8
( 2, NULL, '2024-05-18 19:20+00', 'delivered'),  -- 9
(10, NULL, '2024-06-02 07:50+00', 'delivered'),  -- 10
(15, 5,    '2024-06-14 13:30+00', 'delivered'),  -- 11
( 1, NULL, '2024-07-01 22:10+00', 'delivered'),  -- 12
(14, NULL, '2024-07-09 10:00+00', 'delivered'),  -- 13
(18, 4,    '2024-07-21 15:45+00', 'delivered'),  -- 14
( 4, NULL, '2024-08-05 09:30+00', 'delivered'),  -- 15
( 8, 6,    '2024-08-19 18:00+00', 'delivered'),  -- 16
( 3, NULL, '2024-09-02 11:25+00', 'cancelled'),  -- 17
(12, NULL, '2024-09-10 14:00+00', 'delivered'),  -- 18
( 6, 5,    '2024-09-28 08:05+00', 'delivered'),  -- 19
( 1, NULL, '2024-10-12 20:30+00', 'delivered'),  -- 20
( 9, NULL, '2024-10-31 23:59+00', 'delivered'),  -- 21
( 5, 4,    '2024-11-15 10:45+00', 'shipped'),    -- 22
(18, NULL, '2024-11-29 09:00+00', 'shipped'),    -- 23
(15, 6,    '2024-12-20 16:15+00', 'shipped'),    -- 24
( 2, NULL, '2024-12-24 12:00+00', 'paid'),       -- 25
(11, NULL, '2025-01-05 03:30+00', 'paid'),       -- 26
(13, 5,    '2025-01-08 15:00+00', 'pending'),    -- 27
( 7, NULL, '2025-01-10 19:10+00', 'pending'),    -- 28
(16, NULL, '2025-01-11 08:45+00', 'cancelled'),  -- 29
(12, NULL, '2025-01-12 12:12+00', 'pending');    -- 30

-- order lines: unit_price is copied from the book's current price
INSERT INTO order_items (order_id, book_id, quantity, unit_price)
SELECT v.order_id, v.book_id, v.quantity, b.price
FROM (VALUES
    ( 1, 1,1), ( 1, 5,1),
    ( 2, 3,2),
    ( 3, 7,1), ( 3, 8,1),
    ( 4, 2,1),
    ( 5,10,1),
    ( 6,16,3),
    ( 7,13,1),
    ( 8,17,2), ( 8,16,1),
    ( 9, 4,1),
    (10,18,1),
    (11,24,1), (11, 1,1),
    (12,17,1),
    (13,21,1), (13,22,1),
    (14,16,1), (14,23,1),
    (15,11,2),
    (16,14,1), (16,15,1),
    (17, 6,1),
    (18, 7,1), (18,19,1), (18,20,1),
    (19,12,1),
    (20,18,1), (20,19,1),
    (21,13,1), (21,12,1),
    (22, 3,1),
    (23,17,4),
    (24, 5,2), (24, 6,1),
    (25, 1,1),
    (26,21,1),
    (27,23,1), (27,17,1),
    (28,10,1),
    (29,14,1),
    (30,22,1), (30,21,1), (30, 5,1)
) AS v(order_id, book_id, quantity)
JOIN books b ON b.book_id = v.book_id;

INSERT INTO reviews (book_id, customer_id, rating, comment, created_at) VALUES
( 1,  1, 5, 'Timeless. Loved every page.',        '2024-02-15 10:00+00'),
( 5,  1, 4, 'Charming adventure.',                '2024-02-20 18:30+00'),
( 3,  2, 5, 'Terrifyingly relevant.',             '2024-03-01 21:00+00'),
( 7,  4, 5, 'A masterpiece of world-building.',   '2024-03-20 09:10+00'),
( 8,  4, 3, 'Big ideas, thin characters.',        '2024-03-25 09:15+00'),
(10,  6, 4, NULL,                                 '2024-04-15 12:00+00'),
(16,  8, 5, 'Changed how I see history.',         '2024-04-30 20:45+00'),
(13,  9, 5, 'Could not sleep after this.',        '2024-05-02 01:30+00'),
(17, 12, 4, 'Practical and easy to apply.',       '2024-05-20 07:00+00'),
(16, 12, 3, 'Interesting but a bit long.',        '2024-06-01 07:05+00'),
( 4,  2, 4, NULL,                                 '2024-06-03 19:00+00'),
(18, 10, 5, 'Hilarious and clever.',              '2024-06-20 06:00+00'),
(24, 15, 4, 'Beautifully written.',               '2024-06-30 14:00+00'),
( 1, 15, 5, NULL,                                 '2024-07-02 14:05+00'),
(17,  1, 5, 'My favourite self-help book.',       '2024-07-15 22:00+00'),
(21, 14, 5, 'Brilliant magic system.',            '2024-07-25 11:00+00'),
(22, 14, 4, 'Long but worth it.',                 '2024-08-20 11:30+00'),
(16, 18, 4, NULL,                                 '2024-08-01 16:00+00'),
(23, 18, 5, 'Moving and unforgettable.',          '2024-08-10 16:10+00'),
(11,  4, 5, 'The best Christie.',                 '2024-08-25 09:40+00'),
(14,  8, 2, 'Too long for me.',                   '2024-09-15 18:20+00'),
(15,  8, 4, NULL,                                 '2024-09-20 18:25+00'),
( 7, 12, 5, 'I re-read it every year.',           '2024-09-30 15:00+00'),
(19, 12, 3, 'Strange but memorable.',             '2024-10-05 15:10+00'),
(12,  6, 4, 'A classic for a reason.',            '2024-10-10 08:15+00'),
(18,  1, 4, NULL,                                 '2024-11-01 21:00+00');

\echo ''
\echo 'Stage 2 loaded: database "bookstore" (publishers, genres, authors, books, book_authors,'
\echo 'customers, customer_profiles, employees, orders, order_items, reviews).'
\echo 'Connect with:  psql -d bookstore      Inspect a table with:  \\d books'
