# Take it to your Mac

Everything in this course runs in your browser, so you never *need* to install anything. But real work happens in a real PostgreSQL on your own machine, and some steps (like Module 2's psql tour and the optional Operations lessons in Advanced) are best practiced there.

This page records the setup you already have, so you can rebuild it if you ever need to.

## Your setup

| | |
|---|---|
| Computer | MacBook, Apple Silicon (M2), macOS |
| Homebrew | installed at `/opt/homebrew` |
| PostgreSQL | `postgresql@18` (version 18.6), installed with Homebrew |
| Server | `localhost`, port `5432`, auto-starts at login |
| Your role (username) | `tugsbiligt`, a superuser with a password |
| Course databases | `practice` (Modules 1–10) and `bookstore` (Module 11 onwards), built from the files below |
| Tools | `psql` (Terminal) first, pgAdmin 4 second |

## Install from scratch (only if you ever need to)

```bash
brew install postgresql@18
echo 'export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
brew services start postgresql@18
```

**Why `postgresql@18` and not just `postgresql`?** The `@18` pins the major version, so a future `brew upgrade` can't silently jump you to version 19.

## Everyday commands

```bash
brew services list                 # is PostgreSQL running?
brew services start postgresql@18  # start it
brew services stop postgresql@18   # stop it
psql practice                      # open the Modules 1–10 database
psql bookstore                     # open the Module 11+ database
```

Logs live in `/opt/homebrew/var/log/postgresql@18.log`, and data in `/opt/homebrew/var/postgresql@18`.

## The course data: Inkwell Books

Every lesson runs on data about **Inkwell Books**, a small online bookstore. It comes in four files, and each one is for a stage of the course. The lessons on this site load **exactly the same files**, so what you see in the browser is what you'll get on your Mac:

| File | When to run it | What it creates |
|---|---|---|
| [`01_practice_basics.sql`](/downloads/postgresql/01_practice_basics.sql) | Modules 3–10 | A **practice** database with three simple tables: 30 books, 20 customers and 30 sales. There are no keys yet, and some values are missing or have messy spacing and capitals on purpose. |
| [`02_bookstore.sql`](/downloads/postgresql/02_bookstore.sql) | Modules 11–17 | A **bookstore** database with 11 connected tables, keys and constraints. It includes every kind of relationship: one-to-many, many-to-many, one-to-one, and a table that points to itself (employees and their managers). |
| [`03_bookstore_growth.sql`](/downloads/postgresql/03_bookstore_growth.sql) | Intermediate level | Adds 5,020 customers, about 39,000 orders, payments with refunds, time zones, JSON and list-style columns, and a messy imported customer list to clean up. |
| [`04_bookstore_big_data.sql`](/downloads/postgresql/04_bookstore_big_data.sql) | Advanced level (not on the site yet) | Adds 2 million website events (about 200 MB) with no extra indexes, for your speed-tuning practice. It's too big for the browser, so it's Mac-only. |

Order matters: 03 needs 02, and 04 needs 03.

### How to run a file

Save the files into one folder, for example `~/sql-learning/sql-sample-data`. Then, in Terminal:

```bash
cd ~/sql-learning/sql-sample-data
psql -d postgres -f 01_practice_basics.sql
psql -d practice
```

Swap in the file you need, and use `psql -d bookstore` for files 02 to 04.

**Why `-d postgres`?** Without `-d`, psql tries to open a database named after you (`tugsbiligt`), which doesn't exist, so you'd get an error. The files build their own database, so they only need somewhere to start from, and `postgres` is always there.

### Starting over

Broke something while practicing? Run the file again.

- `01` rebuilds **practice** from scratch.
- `02` rebuilds **bookstore** from scratch. This also removes what 03 and 04 added, so run those again afterwards if you need them.
- `03` refuses to run twice. Run `02` first, then `03`.
- `04` rebuilds only the website-events table.

The generated data comes out exactly the same every time, so your answers stay the same each time you rebuild.

## A psql tip learned the hard way

Backslash commands (`\dt`, `\l`, `\c` …) **end at the end of the line**. They don't use semicolons, and you can't put SQL after them on the same line:

```text
\dt                          ✓
SELECT * FROM countries;     ✓  (on its own line)
\dt SELECT * FROM countries; ✗  psql treats "SELECT", "*", … as extra arguments to \dt
```
