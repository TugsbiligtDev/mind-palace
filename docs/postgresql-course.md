# PostgreSQL Course Plan

The owner's full plan for the PostgreSQL course: 51 modules across three levels. Each module is one lesson on the site with its own quiz. Lessons live in `content/postgresql/<level>/<folder>/`.

🔹 = a brief, recognition-only item (a short "just recognize it" step in the lesson).

## Status

| Level | Modules | Status |
|---|---|---|
| Beginner: Fundamentals | 1–17 | Built (branch `content/postgresql-v2`) |
| Intermediate: Essential+ | 18–39 | Built (branch `content/postgresql-v2`) |
| Advanced: Mastery | 40–46, plus optional 47–51 | Planned |

## What runs where

Lessons run on a real PostgreSQL 18 inside the browser (PGlite), with the Wanderly trip-planning dataset (`content/postgresql/dataset.sql`). Some topics can't run there. They become reading steps plus "try it on your Mac" steps:

- **Needs two sessions at once** (locking, deadlocks in Module 31): explained with step-by-step timelines.
- **Needs a real server or other tools** (psql connection flags, Python code, pg_dump, Docker, replication, PgBouncer, config files): Mac steps only.
- **Needs an extension** (pg_trgm, pgvector, citext, pg_stat_statements): requires loading the extension into the browser engine first.

---

## Beginner: Fundamentals

### Part 1: How Databases Work

| # | Module | Folder | Covers |
|---|---|---|---|
| 1 | What a Database Is | `01-what-is-a-database` | Data vs. information; why databases beat spreadsheets (duplicate data, several users at once, rules that keep data correct); DBMS; the relational model (tables, rows, columns); SQL; the client–server idea; where PostgreSQL fits; 🔹 MySQL, SQLite, NoSQL such as MongoDB |
| 2 | Terminal & Connection Basics | `02-terminal-and-psql` | macOS Terminal and zsh (pwd, ls, cd, file paths); server, host, port 5432, connection; psql; meta-commands (`\l`, `\c`, `\dt`, `\d`, `\dn`, `\du`, `\x`, `\timing`, `\i`, `\?`, `\q`); GUI clients and why psql too; common mistakes: missing semicolon (`=#` → `-#`), wrong database |
| 3 | Databases, Schemas & Tables | `03-databases-schemas-tables` | Cluster → database → schema → table; the public schema; CREATE/DROP DATABASE; CREATE/DROP TABLE; naming conventions (snake_case); why quoted "CamelCase" causes trouble; comments (`--`, `/* */`); .sql script files |

### Part 2: Data Types & Basic SQL (CRUD)

| # | Module | Folder | Covers |
|---|---|---|---|
| 4 | Core Data Types | `04-data-types` | integer, bigint; numeric(p,s) vs. real/double precision; text vs. varchar(n) vs. char(n); boolean; date, time, timestamp vs. timestamptz; interval; casting (`::`, CAST); 🔹 smallint; 🔹 the money type (avoid) |
| 5 | Inserting Data | `05-inserting-data` | INSERT one and many rows; column lists; DEFAULT; RETURNING; single vs. double quotes; escaping quotes (`''`) |
| 6 | Querying One Table | `06-querying-one-table` | SELECT columns vs. `*`; WHERE; comparison operators; AND/OR/NOT and precedence; IN, BETWEEN, LIKE/ILIKE; ORDER BY; LIMIT/OFFSET; DISTINCT; AS aliases; computed columns; evaluation order (FROM → WHERE → SELECT → ORDER BY) |
| 7 | NULL & Three-Valued Logic | `07-null` | NULL = unknown; TRUE/FALSE/UNKNOWN; `= NULL` vs. IS NULL; IS DISTINCT FROM; NULL in comparisons, arithmetic, concatenation; NULLS FIRST/LAST; COALESCE; the NOT IN + NULL trap (preview); when a column should allow NULL |
| 8 | Updating & Deleting | `08-updating-deleting` | UPDATE … SET … WHERE; DELETE … WHERE; the forgotten WHERE; SELECT first; RETURNING; TRUNCATE; 🔹 DELETE … USING |
| 9 | Built-in Functions & Expressions | `09-functions` | Text functions (length, lower/upper, trim, `\|\|`, concat, substring, replace, split_part); number functions (round, ceil, floor, abs); dates (now(), current_date, date_trunc, extract, age, interval arithmetic); CASE; NULLIF; 🔹 greatest/least |
| 10 | Aggregation | `10-aggregation` | COUNT(*) vs. COUNT(col); SUM, AVG, MIN, MAX; GROUP BY; HAVING vs. WHERE; NULLs in aggregates; the "must appear in the GROUP BY clause" error; 🔹 string_agg, array_agg |

### Part 3: Keys, Constraints & Relationships

| # | Module | Folder | Covers |
|---|---|---|---|
| 11 | Primary Keys | `11-primary-keys` | Why every table needs one; PK = UNIQUE + NOT NULL; natural vs. surrogate keys; GENERATED ALWAYS AS IDENTITY; 🔹 SERIAL; UUIDs with gen_random_uuid() and uuidv7() (PG18); composite PKs |
| 12 | Constraints | `12-constraints` | NOT NULL; UNIQUE (and NULLs); CHECK; DEFAULT; naming constraints; reading violation errors; 🔹 UNIQUE NULLS NOT DISTINCT |
| 13 | Foreign Keys & Relationships | `13-foreign-keys` | REFERENCES; parent/child; referential integrity; one-to-many; one-to-one (FK + UNIQUE); many-to-many via junction table; self-referencing FKs; ON DELETE/ON UPDATE actions; insert order; FK columns aren't indexed automatically; 🔹 DEFERRABLE |
| 14 | Joins | `14-joins` | INNER, LEFT (finding rows with no match), FULL OUTER; self joins; three or more tables through a junction table; ON vs. USING; table aliases; the fan-out mistake; joins with GROUP BY; 🔹 RIGHT JOIN; 🔹 CROSS JOIN |
| 15 | Changing Table Structure | `15-altering-tables` | ALTER TABLE add/drop/rename columns; changing a type; adding/dropping constraints; adding NOT NULL or FKs to tables with data; the danger of DROP … CASCADE |

### Part 4: Data Modeling

| # | Module | Folder | Covers |
|---|---|---|---|
| 16 | Entity-Relationship Modeling | `16-er-modeling` | Entities, attributes, relationships; cardinality and optionality; crow's-foot diagrams; requirements → tables; FK naming; dbdiagram.io, DBeaver/pgAdmin ER views |
| 17 | Normalization | `17-normalization` | Insert/update/delete anomalies; functional dependency; 1NF, 2NF, 3NF with worked examples; comma lists, repeating columns, storing calculable values; 🔹 BCNF |

**Practice (Beginner):** the early sections of pgexercises.com (simple queries, joins, modifying data, basic aggregation); build and query your own capstone database as you go.

---

## Intermediate: Essential+

### Part 5: Advanced Querying

| # | Module | Folder | Covers |
|---|---|---|---|
| 18 | Subqueries | `18-subqueries` | Scalar subqueries; IN subqueries; EXISTS / NOT EXISTS; the full NOT IN + NULL trap; correlated subqueries; derived tables in FROM |
| 19 | Common Table Expressions | `19-ctes` | WITH for readability; chaining CTEs; recursive CTEs for hierarchies; 🔹 data-modifying CTEs |
| 20 | Set Operations | `20-set-operations` | UNION vs. UNION ALL; INTERSECT; EXCEPT; matching column counts and types |
| 21 | LATERAL Joins & DISTINCT ON | `21-lateral-distinct-on` | LATERAL; latest N per group; set-returning functions per row; DISTINCT ON and its ORDER BY rule; choosing LATERAL vs. DISTINCT ON vs. window functions |
| 22 | Window Functions | `22-window-functions` | OVER, PARTITION BY, ORDER BY; ROW_NUMBER, RANK, DENSE_RANK; LAG, LEAD; running totals and moving averages; frame clauses (ROWS BETWEEN); top-N per group; FILTER on aggregates; 🔹 NTILE |
| 23 | Reporting Queries | `23-reporting` | Grouping by time with date_trunc; filling gaps with generate_series; pivot-style reports with FILTER or CASE; 🔹 GROUPING SETS, ROLLUP, CUBE |
| 24 | Upserts & Bulk Data | `24-upserts-bulk-data` | INSERT … ON CONFLICT DO NOTHING / DO UPDATE; MERGE; COPY vs. `\copy` for CSV; import errors (encodings, date formats, empty vs. NULL) |
| 25 | Writing Readable SQL & Problem-Solving | `25-readable-sql` | Formatting conventions; meaningful aliases; breaking problems into CTE steps; checking answers (row counts, edge cases, simpler comparison queries); commenting the "why"; common logic mistakes; 🔹 pgFormatter, SQLFluff |

### Part 6: Text, Time & PostgreSQL-Specific Types

| # | Module | Folder | Covers |
|---|---|---|---|
| 26 | Text & Pattern Matching | `26-text-patterns` | LIKE/ILIKE recap; regex `~`, `~*`, `!~`; regexp_replace, regexp_matches, regexp_substr, regexp_split_to_table; cleaning messy text; pattern searches and indexes (fix in Module 46); 🔹 SIMILAR TO |
| 27 | Dates, Times & Time Zones | `27-time-zones` | How timestamptz works (UTC inside, shown in session zone); the TimeZone setting; AT TIME ZONE; named zones vs. offsets; daylight saving; end of month, "last 7 days"; `<` next-day vs. BETWEEN; date series |
| 28 | JSON & JSONB | `28-jsonb` | json vs. jsonb; `->`, `->>`, `#>`, `@>`, `?`; jsonb_build_object, jsonb_agg; JSON_TABLE, JSON_VALUE, JSON_QUERY, JSON_EXISTS (PG17); when JSONB fits and when it hides columns |
| 29 | Arrays, Enums & Other Types | `29-arrays-enums-types` | Arrays vs. junction tables; ENUM vs. lookup table vs. CHECK; generated columns (stored, and virtual by default in PG18); 🔹 range types; 🔹 domains; 🔹 inet; 🔹 citext |

### Part 7: Transactions & Concurrency

| # | Module | Folder | Covers |
|---|---|---|---|
| 30 | Transactions | `30-transactions` | ACID; BEGIN, COMMIT, ROLLBACK; autocommit; SAVEPOINT; "current transaction is aborted"; keeping transactions short |
| 31 | Concurrency & Locking | `31-concurrency-locking` | MVCC concept; isolation levels (Read Committed, Repeatable Read, Serializable + retry); lost updates; SELECT … FOR UPDATE / FOR SHARE; SKIP LOCKED job queues; deadlocks and consistent ordering; 🔹 advisory locks |

### Part 8: Performance Fundamentals

| # | Module | Folder | Covers |
|---|---|---|---|
| 32 | Indexes | `32-indexes` | What an index is; B-tree; write cost; multi-column indexes and column order; unique, partial, expression indexes; indexing FK columns; GIN for jsonb and arrays; CREATE INDEX CONCURRENTLY; 🔹 GiST, BRIN, hash |
| 33 | Reading Query Plans | `33-query-plans` | EXPLAIN vs. EXPLAIN ANALYZE; Seq/Index/Index Only/Bitmap scans; nested loop, hash, merge joins; estimated vs. actual rows; buffers (default with ANALYZE in PG18); slow patterns: functions on indexed columns, leading-wildcard LIKE, N+1, deep OFFSET vs. keyset pagination |

### Part 9: Database Objects & Server-Side Logic

| # | Module | Folder | Covers |
|---|---|---|---|
| 34 | Views & Materialized Views | `34-views` | Views for reuse; materialized views; REFRESH (and CONCURRENTLY); when to use which |
| 35 | Functions & Procedures | `35-functions-procedures` | SQL functions; PL/pgSQL basics (variables, IF, loops, RAISE); functions vs. procedures (CALL, transaction control); IMMUTABLE/STABLE/VOLATILE; database vs. application logic |
| 36 | Triggers | `36-triggers` | BEFORE vs. AFTER; row vs. statement level; auto-updating updated_at; audit tables; pitfalls; 🔹 event triggers |

### Part 10: Postgres in Real Applications

| # | Module | Folder | Covers |
|---|---|---|---|
| 37 | Roles & Privileges | `37-roles-privileges` | Roles vs. users (LOGIN); GRANT and REVOKE; least privilege; admin, app and read-only roles; default privileges; public schema permissions (PG15) |
| 38 | Connecting from Code | `38-connecting-from-code` | Connection strings; drivers (psycopg 3, node-postgres); parameterized queries and SQL injection; credentials in environment variables; connection limits; ORMs vs. raw SQL (SQLAlchemy, Django ORM, Prisma, Drizzle); the ORM N+1 pitfall |
| 39 | Migrations & Backup Basics | `39-migrations-backups` | Schema migrations; Alembic/Django migrations, Flyway, Liquibase; pg_dump and pg_restore (-Fc); pg_dumpall for roles; testing restores; Postgres in Docker |

**Practice (Intermediate):** the Pagila sample database (a DVD-rental store) for business questions with window functions, LATERAL and CTEs; the remaining pgexercises.com sections; solve each hard problem two ways and compare the plans.

---

## Advanced: Mastery

### Part 11: Advanced Data Modeling

| # | Module | Covers |
|---|---|---|
| 40 | Design Patterns & Trade-offs | Many-to-many with attributes; soft vs. hard delete; history and audit tables; temporal data with ranges and exclusion constraints; temporal PKs and FKs (WITHOUT OVERLAPS, PERIOD; PG18); multi-tenancy (tenant_id vs. schema vs. database per tenant); hierarchies (adjacency list vs. closure table, 🔹 ltree); polymorphic associations and FK-safe alternatives; the EAV anti-pattern; deliberate denormalization |
| 41 | Safe Schema Changes in Production | Which ALTER TABLE operations lock; lock_timeout; NOT VALID then VALIDATE; building indexes concurrently; expand-and-contract; backfilling in batches |

### Part 12: Performance Engineering

| # | Module | Covers |
|---|---|---|
| 42 | Query Optimization & Troubleshooting | Planner statistics and ANALYZE; bad row estimates; CREATE STATISTICS; CTE MATERIALIZED vs. NOT MATERIALIZED; covering indexes with INCLUDE; index-only scans; skip scan (PG18); pg_stat_statements; work_mem; pg_stat_activity and pg_locks; 🔹 auto_explain |
| 43 | Vacuum, Bloat & MVCC in Practice | Dead rows and bloat; VACUUM, ANALYZE, autovacuum; transaction ID wraparound; long-running and "idle in transaction" sessions; VACUUM FULL vs. online alternatives; 🔹 HOT updates and fillfactor; 🔹 pg_repack and REPACK (PG19) |
| 44 | Partitioning | Range, list, hash; partition pruning; when it's worth it; PK and index rules; attaching, detaching, dropping partitions |

### Part 13: Security & Ecosystem

| # | Module | Covers |
|---|---|---|
| 45 | Advanced Security | Row-Level Security and tenant isolation; SECURITY DEFINER and search_path pitfalls; SSL/TLS; secrets handling; 🔹 pgaudit |
| 46 | Extensions & Search | CREATE EXTENSION; pg_stat_statements; pg_trgm (fuzzy matching, indexes for `LIKE '%text%'` and regex); pgvector; full-text search (tsvector, tsquery, ranking, GIN); 🔹 PostGIS; 🔹 TimescaleDB |

### Part 14: Optional Operations Track (DBA-focused)

| # | Module | Covers |
|---|---|---|
| 47 | Configuration & Connection Management | shared_buffers, work_mem, maintenance_work_mem, effective_cache_size, max_connections; pg_hba.conf (scram-sha-256; MD5 deprecated in PG18); PgBouncer; statement_timeout, idle_in_transaction_session_timeout; ALTER SYSTEM and reload |
| 48 | Backup & Point-in-Time Recovery | Logical vs. physical backups; WAL; pg_basebackup; incremental backups (PG17); PITR; pgBackRest; RPO/RTO |
| 49 | Replication & High Availability | Streaming replication and read replicas; sync vs. async; replication lag; failover with Patroni; logical replication; replication slot risks |
| 50 | Monitoring | pg_stat_user_tables and pg_stat_user_indexes (unused indexes); cache hit ratio; log_min_duration_statement; alerting basics; 🔹 pg_stat_io |
| 51 | Upgrades & Managed Postgres | Minor vs. major versions and the 5-year policy; pg_upgrade; upgrading with logical replication; RDS/Aurora, Cloud SQL, Azure, Supabase, Neon |

**Practice (Advanced):** generate millions of rows with generate_series and tune queries against them; load real public datasets (e.g., government open-data CSVs) and model them properly; read EXPLAIN ANALYZE for every slow query you write.

---

## Capstone projects

- **Beginner:** a library system with books, authors (many-to-many), members and loans. Draw the ER diagram, normalize to 3NF, build every table with PKs, FKs and constraints, load sample data, and write 20+ queries using joins, filtering, NULL handling and aggregates.
- **Intermediate:** an e-commerce database with customers, products, orders, order items, payments and reviews. Includes a checkout transaction, inventory upserts, window-function and LATERAL sales reports, time-zone-correct daily revenue, JSONB product attributes, indexes verified with EXPLAIN ANALYZE, separate roles, versioned migrations, a Python script with parameterized queries, and a tested backup and restore.
- **Advanced:** a multi-tenant SaaS database with RLS tenant isolation, trigger-based audit history, and a partitioned event log with retention. Work with millions of generated rows, tune the top queries with pg_stat_statements, perform a zero-downtime schema change, and build full-text and fuzzy search. Optional track: add a streaming replica and PITR with pgBackRest in Docker.

## Final skills

- **After Beginner:** design a normalized relational database from plain-English requirements, create it with correct keys and constraints, handle NULLs correctly, and write everyday SQL to insert, query, join, aggregate, update and delete data.
- **After Intermediate:** write complex, readable analytical queries, verify that they're correct, work confidently with text, time zones and JSONB, handle transactions and concurrency, speed up queries with indexes, and connect a real application safely.
- **After Advanced:** make senior-level design trade-offs, change production schemas safely, diagnose and tune performance, manage vacuum and bloat, and secure multi-tenant data. The optional track adds entry-level DBA operations.

## Not covered / deferred

Storage internals (pages, TOAST, WAL format) · planner/executor source code · writing C extensions · custom index access methods · foreign data wrappers (postgres_fdw) · sharding (Citus) · logical decoding / change data capture (Debezium) · Kubernetes operators (CloudNativePG) · advanced PostGIS · SQL/PGQ graph queries (PG19) · query plan hints (pg_plan_advice, PG19) · LISTEN/NOTIFY · tablespaces · large objects · two-phase commit · multi-master replication · collations/ICU in depth · JIT tuning · OS/kernel tuning and huge pages · background workers · pgvector index tuning in depth
