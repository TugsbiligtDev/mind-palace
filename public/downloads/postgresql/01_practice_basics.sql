-- =====================================================================
-- STAGE 1 — PRACTICE BASICS                 (Roadmap Modules 3–10)
-- Database: practice
--
-- Three simple, stand-alone tables with NO keys or relationships yet.
-- That is on purpose: you learn primary/foreign keys in Modules 11–13,
-- and Stage 2 (02_bookstore.sql) is the "properly designed" version.
--
--   books   – 30 books in one flat table
--   customers – 20 customers
--   sales   – 30 sales, stored the "bad" flat way (repeats book and
--             customer details on every row). You will use it in
--             Module 17 to see WHY normalization matters.
--
-- Deliberate "real-world" mess for practice:
--   * some NULLs (missing price, genre, email, description …)
--   * a few text values with extra spaces or odd capitalization
--
-- HOW TO RUN (from Terminal, in the folder holding this file):
--     psql -f 01_practice_basics.sql
-- Then connect with:  psql -d practice
--
-- Re-running this file DELETES and rebuilds the practice database,
-- so it's also your "reset button".
-- =====================================================================

DROP DATABASE IF EXISTS practice;
CREATE DATABASE practice;
\c practice

-- ---------------------------------------------------------------------
-- books
-- ---------------------------------------------------------------------
CREATE TABLE books (
    book_id        integer,
    title          text,
    author_name    text,
    genre          text,
    published_year integer,
    price          numeric(6,2),      -- exact decimal: right type for money
    pages          integer,
    stock          integer,
    is_bestseller  boolean,
    isbn           text,
    added_at       timestamptz,       -- date + time + time zone
    description    text
);

INSERT INTO books VALUES
( 1, 'Pride and Prejudice',             'Jane Austen',        'Classic',         1813,  9.99, 432,  25, true,  '978-0141439518', '2024-01-15 10:30:00+00', 'A witty story of love, pride and social class.'),
( 2, 'Emma',                            'Jane Austen',        'Classic',         1815,  8.99, 474,  12, false, '978-0141439587', '2024-01-15 10:32:00+00', NULL),
( 3, '1984',                            'George Orwell',      'Science Fiction', 1949, 12.50, 328,  40, true,  '978-0451524935', '2024-01-20 09:00:00+00', 'A chilling vision of total state surveillance.'),
( 4, 'Animal Farm',                     'George Orwell',      'Classic',         1945,  7.99, 112,  33, true,  '978-0451526342', '2024-01-20 09:05:00+00', 'Farm animals overthrow their farmer.'),
( 5, 'The Hobbit',                      'J.R.R. Tolkien',     'Fantasy',         1937, 14.99, 310,  18, true,  '978-0547928227', '2024-02-01 14:00:00+00', 'Bilbo Baggins joins a quest for dragon treasure.'),
( 6, '  The Fellowship of the Ring ',   'J.R.R. Tolkien',     'Fantasy',         1954, 16.99, 423,   9, true,  '978-0547928210', '2024-02-01 14:10:00+00', NULL),
( 7, 'Dune',                            'Frank Herbert',      'Science Fiction', 1965, 18.00, 688,  22, true,  '978-0441172719', '2024-02-10 11:45:00+00', 'Politics, religion and giant sandworms on a desert planet.'),
( 8, 'Foundation',                      'Isaac Asimov',       'Science Fiction', 1951, 11.25, 255,   0, false, '978-0553293357', '2024-02-10 12:00:00+00', 'A mathematician predicts the fall of an empire.'),
( 9, 'I, Robot',                        'Isaac Asimov',       'Science Fiction', 1950,  9.50, 253,   7, false, '978-0553382563', '2024-02-11 08:20:00+00', NULL),
(10, 'Murder on the Orient Express',    'Agatha Christie',    'Mystery',         1934, 10.99, 256,  14, true,  '978-0062693662', '2024-03-05 16:00:00+00', 'Poirot solves a murder aboard a snowbound train.'),
(11, 'And Then There Were None',        'Agatha Christie',    'Mystery',         1939, 10.99, 272,  20, true,  '978-0062073488', '2024-03-05 16:05:00+00', 'Ten strangers on an island, one by one…'),
(12, 'The Hound of the Baskervilles',   'Arthur Conan Doyle', 'Mystery',         1902,  6.99, 256,   5, false, '978-0141199177', '2024-03-06 10:00:00+00', 'Sherlock Holmes and a legendary hound.'),
(13, 'Frankenstein',                    'Mary Shelley',       'Horror',          1818,  7.50, 280,  11, false, '978-0141439471', '2024-03-15 13:30:00+00', 'A scientist creates life, with terrible results.'),
(14, 'Dracula',                         'Bram Stoker',        'Horror',          1897,  8.25, 488,   8, false, '978-0141439846', '2024-03-15 13:40:00+00', NULL),
(15, 'The Shining',                     'Stephen King',       'Horror',          1977, 15.99, 688,  16, true,  '978-0307743657', '2024-04-02 09:15:00+00', 'A haunted hotel and a family snowed in.'),
(16, 'It',                              'Stephen King',       'Horror',          1986, 19.99, 1138,  4, true,  '978-1501142970', '2024-04-02 09:20:00+00', 'A shape-shifting evil terrorizes a small town.'),
(17, 'Sapiens',                         'Yuval Noah Harari',  'Non-Fiction',     2011, 22.00, 443,  30, true,  '978-0062316097', '2024-04-18 17:00:00+00', 'A brief history of humankind.'),
(18, 'Thinking, Fast and Slow',         'Daniel Kahneman',    'Non-Fiction',     2011, 17.99, 499,  13, true,  '978-0374533557', '2024-04-18 17:10:00+00', 'How two systems of thinking shape our decisions.'),
(19, 'Atomic Habits',                   'James Clear',        'Self-Help',       2018, 16.20, 320,  45, true,  '978-0735211292', '2024-05-01 08:00:00+00', 'Tiny changes, remarkable results.'),
(20, 'The 7 Habits of Highly Effective People', 'Stephen Covey', 'Self-Help',    1989, 14.50, 432,   6, false, '978-1982137274', '2024-05-01 08:10:00+00', NULL),
(21, 'Jane Eyre',                       'Charlotte Bronte',   'Classic',         1847,  8.50, 532,  10, false, '978-0141441146', '2024-05-20 12:00:00+00', 'An orphan governess and the mysterious Mr Rochester.'),
(22, 'Wuthering Heights',               'Emily Bronte',       'Classic',         1847,  8.50, 416,   0, false, '978-0141439556', '2024-05-20 12:05:00+00', NULL),
(23, 'The Great Gatsby',                'F. Scott Fitzgerald','Classic',         1925, 10.00, 180,  27, true,  '978-0743273565', '2024-06-01 15:00:00+00', 'Wealth, love and longing in the Jazz Age.'),
(24, 'Neuromancer',                     'William Gibson',     'Science Fiction', 1984, 13.99, 271,   3, false, '978-0441569595', '2024-06-12 10:00:00+00', 'The novel that defined cyberpunk.'),
(25, 'The Name of the Wind',            'Patrick Rothfuss',   'Fantasy',         2007, 12.99, 662,  19, true,  '978-0756404741', '2024-07-07 19:30:00+00', 'A legendary hero tells his own story.'),
(26, 'Mistborn: The Final Empire',      'brandon sanderson',  'Fantasy',         2006, 11.99, 541,  21, true,  '978-0765350381', '2024-07-07 19:40:00+00', 'A heist story set in a world of ash and magic.'),
(27, 'The Silent Garden',               'Mira Castellanos',   NULL,              2023,  NULL, 298,   0, false, NULL,             '2024-08-15 11:00:00+00', 'Upcoming debut novel. Price not set yet.'),
(28, 'Educated',                        'Tara Westover',      'Non-Fiction',     2018, 15.00, 352,  12, true,  '978-0399590504', '2024-08-20 10:00:00+00', 'A memoir of growing up without school.'),
(29, 'Rebecca',                         'Daphne du Maurier',  'Mystery',         1938, 11.50, 410,   9, false, '978-0380730407', '2024-09-01 09:00:00+00', NULL),
(30, 'Brave New World',                 'Aldous Huxley',      'Science Fiction', 1932, 10.50, 288,  15, false, '978-0060850524', '2024-09-10 14:45:00+00', 'A future society engineered for happiness.');

-- ---------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------
CREATE TABLE customers (
    customer_id    integer,
    first_name     text,
    last_name      text,
    email          text,
    phone          text,
    city           text,
    country        text,
    birth_date     date,
    joined_at      timestamptz,
    loyalty_points integer
);

INSERT INTO customers VALUES
( 1, 'Emma',     'Johnson',  'emma.johnson@example.com',    '+1-212-555-0101', 'New York',    'USA',       '1990-04-12', '2024-01-10 09:15:00+00', 120),
( 2, 'Liam',     'Smith',    'liam.smith@example.com',      NULL,              'London',      'UK',        '1985-11-03', '2024-01-22 18:40:00+00',  45),
( 3, 'Olivia',   'Brown',    'OLIVIA.BROWN@EXAMPLE.COM',    '+44 20 7946 0958','Manchester',  'UK',        '1998-07-25', '2024-02-05 12:00:00+00',   0),
( 4, 'Noah',     'Garcia',   'noah.garcia@example.com',     '+34 91 555 0199', 'Madrid',      'Spain',     '1979-02-14', '2024-02-18 08:30:00+00', 310),
( 5, 'Ava',      'Martinez', NULL,                          '+52 55 5555 0144','Mexico City', 'Mexico',    '2001-09-09', '2024-03-01 21:05:00+00',  15),
( 6, 'Lucas',    'Müller',   'lucas.mueller@example.com',   '+49 30 5555 0123','Berlin',      'Germany',   '1993-12-30', '2024-03-12 07:45:00+00',  80),
( 7, 'Sophia',   'Rossi',    'sophia.rossi@example.com',    NULL,              'Rome',        'Italy',     NULL,         '2024-03-28 15:20:00+00',   5),
( 8, 'Mateo',    'Silva',    'mateo.silva@example.com',     '+55 11 5555 0177','São Paulo',   'Brazil',    '1988-05-17', '2024-04-09 13:10:00+00', 200),
( 9, 'Mia',      'Tanaka',   'mia.tanaka@example.com',      '+81 3 5555 0166', 'Tokyo',       'Japan',     '1995-08-01', '2024-04-03 02:00:00+00',  60),
(10, 'Ethan',    'Kim',      'ethan.kim@example.com',       '+82 2 5555 0155', 'Seoul',       'South Korea','1992-10-21','2024-05-14 05:55:00+00',  95),
(11, 'Isabella', 'Nguyen',   'isabella.nguyen@example.com', NULL,              'Sydney',      'Australia', '1999-03-03', '2024-05-29 23:30:00+00',   0),
(12, 'James',    'Wilson',   'james.wilson@example.com',    '+1-415-555-0188', 'San Francisco','USA',      '1975-06-06', '2024-04-11 17:00:00+00', 540),
(13, 'Amelia',   'Taylor',   ' amelia.taylor@example.com ', '+1 (312) 555-0111','Chicago',    'USA',       '1987-01-19', '2024-06-25 14:25:00+00',  30),
(14, 'Arjun',    'Patel',    'arjun.patel@example.com',     '+91 22 5555 0133','Mumbai',      'India',     '1994-11-11', '2024-07-08 06:40:00+00',  75),
(15, 'Chloe',    'Dubois',   'chloe.dubois@example.com',    '+33 1 55 55 01 22','Paris',      'France',    '1983-04-04', '2024-05-19 10:10:00+00', 150),
(16, 'Benjamin', 'Lee',      NULL,                          NULL,              'Toronto',     'Canada',    '2000-12-12', '2024-08-02 16:50:00+00',   0),
(17, 'Harper',   'Anderson', 'harper.anderson@example.com', '+1-206-555-0177', 'seattle',     'usa',       '1996-02-29', '2024-08-21 20:15:00+00',  25),
(18, 'Aisha',    'Khan',     'aisha.khan@example.com',      '+971 4 555 0100', 'Dubai',       'UAE',       '1991-07-07', '2024-06-03 09:00:00+00', 400),
(19, 'Daniel',   'Novak',    'daniel.novak@example.com',    '+420 2 5555 0145','Prague',      'Czechia',   '1980-10-10', '2024-09-17 11:35:00+00',  10),
(20, 'Zoe',      'Clarke',   'zoe.clarke@example.com',      NULL,              'London',      'UK',        '2003-05-05', '2024-10-01 19:45:00+00',   0);

-- ---------------------------------------------------------------------
-- sales  (a deliberately badly designed, flat "spreadsheet-style" table)
-- Notice how book title, author and customer email repeat on every row.
-- ---------------------------------------------------------------------
CREATE TABLE sales (
    sale_id        integer,
    sold_at        timestamptz,
    customer_email text,
    customer_city  text,
    book_title     text,
    author_name    text,
    genre          text,
    quantity       integer,
    unit_price     numeric(6,2),
    payment_method text
);

INSERT INTO sales VALUES
( 1, '2024-02-03 10:05:00+00', 'emma.johnson@example.com',    'New York',     'Pride and Prejudice',          'Jane Austen',      'Classic',          1,  9.99, 'card'),
( 2, '2024-02-03 10:05:00+00', 'emma.johnson@example.com',    'New York',     'The Hobbit',                   'J.R.R. Tolkien',   'Fantasy',          1, 14.99, 'card'),
( 3, '2024-02-20 17:30:00+00', 'liam.smith@example.com',      'London',       '1984',                         'George Orwell',    'Science Fiction',  2, 12.50, 'paypal'),
( 4, '2024-03-02 09:00:00+00', 'noah.garcia@example.com',     'Madrid',       'Dune',                         'Frank Herbert',    'Science Fiction',  1, 18.00, 'card'),
( 5, '2024-03-02 09:00:00+00', 'noah.garcia@example.com',     'Madrid',       'Foundation',                   'Isaac Asimov',     'Science Fiction',  1, 11.25, 'card'),
( 6, '2024-03-15 20:45:00+00', 'emma.johnson@example.com',    'New York',     'Emma',                         'Jane Austen',      'Classic',          1,  8.99, 'card'),
( 7, '2024-04-01 12:00:00+00', 'lucas.mueller@example.com',   'Berlin',       'Murder on the Orient Express', 'Agatha Christie',  'Mystery',          1, 10.99, 'bank_transfer'),
( 8, '2024-04-10 08:15:00+00', 'mateo.silva@example.com',     'São Paulo',    'Sapiens',                      'Yuval Noah Harari','Non-Fiction',      3, 22.00, 'card'),
( 9, '2024-04-22 16:40:00+00', 'mia.tanaka@example.com',      'Tokyo',        'The Shining',                  'Stephen King',     'Horror',           1, 15.99, 'card'),
(10, '2024-05-05 11:11:00+00', 'james.wilson@example.com',    'San Francisco','Atomic Habits',                'James Clear',      'Self-Help',        2, 16.20, 'paypal'),
(11, '2024-05-05 11:11:00+00', 'james.wilson@example.com',    'San Francisco','Thinking, Fast and Slow',      'Daniel Kahneman',  'Non-Fiction',      1, 17.99, 'paypal'),
(12, '2024-05-18 19:20:00+00', 'liam.smith@example.com',      'London',       'Animal Farm',                  'George Orwell',    'Classic',          1,  7.99, 'card'),
(13, '2024-06-02 07:50:00+00', 'ethan.kim@example.com',       'Seoul',        'Neuromancer',                  'William Gibson',   'Science Fiction',  1, 13.99, 'card'),
(14, '2024-06-14 13:30:00+00', 'chloe.dubois@example.com',    'Paris',        'The Great Gatsby',             'F. Scott Fitzgerald','Classic',        1, 10.00, 'card'),
(15, '2024-06-14 13:30:00+00', 'chloe.dubois@example.com',    'Paris',        'Jane Eyre',                    'Charlotte Bronte', 'Classic',          1,  8.50, 'card'),
(16, '2024-07-01 22:10:00+00', 'emma.johnson@example.com',    'New York',     'Atomic Habits',                'James Clear',      'Self-Help',        1, 16.20, 'card'),
(17, '2024-07-09 10:00:00+00', 'arjun.patel@example.com',     'Mumbai',       'The Name of the Wind',         'Patrick Rothfuss', 'Fantasy',          1, 12.99, 'upi'),
(18, '2024-07-21 15:45:00+00', 'aisha.khan@example.com',      'Dubai',        'Sapiens',                      'Yuval Noah Harari','Non-Fiction',      1, 22.00, 'card'),
(19, '2024-07-21 15:45:00+00', 'aisha.khan@example.com',      'Dubai',        'Educated',                     'Tara Westover',    'Non-Fiction',      1, 15.00, 'card'),
(20, '2024-08-05 09:30:00+00', 'noah.garcia@example.com',     'Madrid',       'I, Robot',                     'Isaac Asimov',     'Science Fiction',  2,  9.50, 'card'),
(21, '2024-08-19 18:00:00+00', 'mateo.silva@example.com',     'São Paulo',    'It',                           'Stephen King',     'Horror',           1, 19.99, 'paypal'),
(22, '2024-09-02 11:25:00+00', 'harper.anderson@example.com', 'Seattle',      'Mistborn: The Final Empire',   'Brandon Sanderson','Fantasy',          1, 11.99, 'card'),
(23, '2024-09-10 14:00:00+00', 'james.wilson@example.com',    'San Francisco','Dune',                         'Frank Herbert',    'Science Fiction',  1, 18.00, 'paypal'),
(24, '2024-09-28 08:05:00+00', 'lucas.mueller@example.com',   'Berlin',       'Frankenstein',                 'Mary Shelley',     'Horror',           1,  7.50, 'bank_transfer'),
(25, '2024-10-12 20:30:00+00', 'emma.johnson@example.com',    'New York',     'Rebecca',                      'Daphne du Maurier','Mystery',          1, 11.50, 'card'),
(26, '2024-10-31 23:59:00+00', 'mia.tanaka@example.com',      'Tokyo',        'Dracula',                      'Bram Stoker',      'Horror',           1,  8.25, 'card'),
(27, '2024-11-15 10:45:00+00', 'daniel.novak@example.com',    'Prague',       'Brave New World',              'Aldous Huxley',    'Science Fiction',  1, 10.50, 'card'),
(28, '2024-11-29 09:00:00+00', 'aisha.khan@example.com',      'Dubai',        'Atomic Habits',                'James Clear',      'Self-Help',        4, 16.20, 'card'),
(29, '2024-12-20 16:15:00+00', 'chloe.dubois@example.com',    'Paris',        'The Hobbit',                   'J.R.R. Tolkien',   'Fantasy',          2, 14.99, 'card'),
(30, '2024-12-24 12:00:00+00', 'liam.smith@example.com',      'London',       'Pride and Prejudice',          'Jane Austen',      'Classic',          1,  9.99, 'paypal');

\echo ''
\echo 'Stage 1 loaded: database "practice" with tables books (30), customers (20), sales (30).'
\echo 'Connect with:  psql -d practice'
