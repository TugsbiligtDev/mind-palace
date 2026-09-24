# Take it to your Mac

Everything in this course runs in your browser, so you never *need* to install anything. But real work happens in a real PostgreSQL on your own machine, and some steps (like Module 0's psql tour and Module 20's operations skills) are best practiced there.

This page records the setup you already have, so you can rebuild it if you ever need to.

## Your setup

| | |
|---|---|
| Computer | MacBook, Apple Silicon (M2), macOS |
| Homebrew | installed at `/opt/homebrew` |
| PostgreSQL | `postgresql@18` (version 18.6), installed with Homebrew |
| Server | `localhost`, port `5432`, auto-starts at login |
| Your role (username) | `tugsbiligt`, a superuser with a password |
| Course database | `learn_sql` |
| Tools | `psql` (Terminal) first, pgAdmin 4 second |

## Install from scratch (only if you ever need to)

```bash
brew install postgresql@18
echo 'export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
brew services start postgresql@18
createdb learn_sql
```

**Why `postgresql@18` and not just `postgresql`?** The `@18` pins the major version, so a future `brew upgrade` can't silently jump you to version 19.

## Everyday commands

```bash
brew services list                 # is PostgreSQL running?
brew services start postgresql@18  # start it
brew services stop postgresql@18   # stop it
psql learn_sql                     # open the course database
```

Logs live in `/opt/homebrew/var/log/postgresql@18.log`, and data in `/opt/homebrew/var/postgresql@18`.

## Load (or reload) the course dataset

The dataset in this site is identical to the one in your `learn_sql` database: 7 tables for a trip-planning app. To rebuild it from scratch, open the course's `dataset.sql` file and run it inside psql:

```bash
psql learn_sql -f dataset.sql
```

It starts with `DROP TABLE IF EXISTS …`, so it's safe to run again. It replaces the 7 course tables and touches nothing else.

## A psql tip learned the hard way

Backslash commands (`\dt`, `\l`, `\c` …) **end at the end of the line**. They don't use semicolons, and you can't put SQL after them on the same line:

```text
\dt                          ✓
SELECT * FROM countries;     ✓  (on its own line)
\dt SELECT * FROM countries; ✗  psql treats "SELECT", "*", … as extra arguments to \dt
```
