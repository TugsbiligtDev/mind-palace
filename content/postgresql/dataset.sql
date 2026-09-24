-- learn_sql: the trip-planning course dataset (from the owner's course brief).
-- Loaded into every lesson and case. Do not reintroduce the old bookstore tables.
DROP TABLE IF EXISTS reviews, trip_stops, trips, travelers, attractions, cities, countries CASCADE;

CREATE TABLE countries (
    country_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    continent     TEXT NOT NULL
);

CREATE TABLE cities (
    city_id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          TEXT NOT NULL,
    country_id    INTEGER NOT NULL REFERENCES countries(country_id),
    population    INTEGER
);

CREATE TABLE attractions (
    attraction_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          TEXT NOT NULL,
    city_id       INTEGER NOT NULL REFERENCES cities(city_id),
    category      TEXT NOT NULL,       -- e.g. 'museum', 'landmark', 'park'
    entry_fee     NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (entry_fee >= 0),
    details       JSONB
);

CREATE TABLE travelers (
    traveler_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name     TEXT NOT NULL,
    email         TEXT UNIQUE,
    home_city     TEXT,
    signup_date   DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE trips (
    trip_id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    traveler_id   INTEGER NOT NULL REFERENCES travelers(traveler_id),
    trip_name     TEXT NOT NULL,
    start_date    DATE NOT NULL,
    end_date      DATE,
    status        TEXT NOT NULL DEFAULT 'planned'   -- planned / completed / cancelled
);

CREATE TABLE trip_stops (
    trip_stop_id  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trip_id       INTEGER NOT NULL REFERENCES trips(trip_id),
    city_id       INTEGER NOT NULL REFERENCES cities(city_id),
    visit_order   INTEGER NOT NULL,
    nights        INTEGER NOT NULL CHECK (nights > 0),
    cost          NUMERIC(8,2)      -- accommodation cost for this stop
);

CREATE TABLE reviews (
    review_id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    attraction_id INTEGER NOT NULL REFERENCES attractions(attraction_id),
    traveler_id   INTEGER NOT NULL REFERENCES travelers(traveler_id),
    rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review_text   TEXT,
    review_date   DATE NOT NULL DEFAULT CURRENT_DATE
);

-- Sample data
INSERT INTO countries (name, continent) VALUES
('Japan', 'Asia'), ('France', 'Europe'), ('Mongolia', 'Asia'),
('Peru', 'South America'), ('Italy', 'Europe');

INSERT INTO cities (name, country_id, population) VALUES
('Tokyo', 1, 13960000),
('Kyoto', 1, 1460000),
('Paris', 2, 2140000),
('Ulaanbaatar', 3, 1500000),
('Cusco', 4, 428450),
('Rome', 5, 2870000),
('Florence', 5, 366000);

INSERT INTO attractions (name, city_id, category, entry_fee, details) VALUES
('Senso-ji Temple', 1, 'landmark', 0.00, '{"duration_hours": 1.5, "indoor": false}'),
('teamLab Planets', 1, 'museum', 22.00, '{"duration_hours": 2, "indoor": true}'),
('Fushimi Inari Shrine', 2, 'landmark', 0.00, '{"duration_hours": 3, "indoor": false}'),
('Eiffel Tower', 3, 'landmark', 28.30, '{"duration_hours": 2, "indoor": false}'),
('Louvre Museum', 3, 'museum', 22.00, '{"duration_hours": 4, "indoor": true}'),
('Gandan Monastery', 4, 'landmark', 0.00, '{"duration_hours": 1, "indoor": false}'),
('Machu Picchu', 5, 'landmark', 45.00, '{"duration_hours": 5, "indoor": false}'),
('Colosseum', 6, 'landmark', 18.00, '{"duration_hours": 2.5, "indoor": false}'),
('Uffizi Gallery', 7, 'museum', 25.00, '{"duration_hours": 3, "indoor": true}');

INSERT INTO travelers (full_name, email, home_city) VALUES
('Amina Yusuf', 'amina@example.com', 'Ulaanbaatar'),
('Baatar Otgon', 'baatar@example.com', 'Ulaanbaatar'),
('Chen Wei', 'chen@example.com', 'Beijing'),
('Dulguun Erdene', NULL, 'Darkhan'),
('Erik Larsen', 'erik@example.com', 'Oslo'),
('Fatima Noor', 'fatima@example.com', 'Cairo');

INSERT INTO trips (traveler_id, trip_name, start_date, end_date, status) VALUES
(1, 'Japan Highlights', '2026-03-01', '2026-03-10', 'completed'),
(1, 'Italian Escape', '2026-08-05', '2026-08-14', 'planned'),
(2, 'Peru Adventure', '2026-05-12', '2026-05-19', 'completed'),
(3, 'Paris Solo Trip', '2026-06-01', '2026-06-07', 'planned'),
(4, 'Europe Grand Tour', '2026-02-01', '2026-02-20', 'completed'),
(5, 'Weekend in Paris', '2026-09-01', NULL, 'planned'),
(6, 'Silk Road & Beyond', '2025-11-10', '2025-11-25', 'completed');

INSERT INTO trip_stops (trip_id, city_id, visit_order, nights, cost) VALUES
(1, 1, 1, 4, 620.00),
(1, 2, 2, 3, 410.00),
(2, 6, 1, 5, 500.00),
(2, 7, 2, 3, 300.00),
(3, 5, 1, 6, 900.00),
(4, 3, 1, 3, 700.00),
(5, 6, 1, 1, 60.00),
(5, 3, 2, 5, 850.00),
(7, 4, 1, 2, 150.00),
(7, 3, 2, 4, 780.00);

INSERT INTO reviews (attraction_id, traveler_id, rating, review_text) VALUES
(1, 2, 5, 'Peaceful and beautiful at dawn.'),
(2, 1, 5, 'Mind-bending digital art.'),
(4, 3, 4, 'Crowded but iconic.'),
(5, 1, 5, 'Could spend all day here.'),
(7, 2, 5, 'Bucket list, fully lived up to the hype.'),
(8, 4, 4, 'Impressive scale, very touristy.'),
(3, 1, 4, 'The gates go on forever.');
