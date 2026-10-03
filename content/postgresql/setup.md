# Take it to your Mac

Everything in this course runs in your browser, so you never *need* to install anything. But real work happens in a real PostgreSQL on your own machine, and a few steps (like Module 2's psql tour) are best practised there. This page sets up a Mac.

## 1. Open Terminal

Press **⌘ + Space**, type *Terminal*, and press Enter. You will see a prompt ending in `%`. That is **zsh**, the shell macOS uses.

## 2. Install Homebrew

Homebrew installs developer tools with one command. Copy the install line from [brew.sh](https://brew.sh), paste it into Terminal, and follow the on-screen steps (it may ask for your Mac password). Check it worked:

```bash
brew --version
```

## 3. Install PostgreSQL 18

```bash
brew install postgresql@18
echo 'export PATH="$(brew --prefix postgresql@18)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
brew services start postgresql@18
psql --version
```

You should see `psql (PostgreSQL) 18.x`. The server now starts by itself whenever you log in.

**Why `postgresql@18` and not just `postgresql`?** The `@18` pins the major version, so a future `brew upgrade` can't silently jump you to version 19.

Homebrew creates a database user (a *role*) with the **same name as your Mac account**, and makes it a superuser. To see that name, run `whoami`.

## Everyday commands

```bash
brew services list                 # is PostgreSQL running?
brew services start postgresql@18  # start it
brew services stop postgresql@18   # stop it
psql practice                      # open the Modules 1–10 database
psql bookstore                     # open the Module 11+ database
```

Something wrong? The server's log is in `$(brew --prefix)/var/log/postgresql@18.log`.

## 4. A visual app (optional)

psql is all the course needs. If you would also like windows and menus for browsing tables, install **pgAdmin** from [pgadmin.org](https://www.pgadmin.org) (free), or try **Postico**, **TablePlus** or **DBeaver**. Connect to host `localhost`, port `5432`, with your Mac username.

## The course data: Inkwell Books

Every lesson runs on data about **Inkwell Books**, a small online bookstore. It comes in four files, and each one is for a stage of the course. The lessons on this site load **exactly the same files**, so what you see in the browser is what you'll get on your Mac:

| File | When to run it | What it creates |
|---|---|---|
| [`01_practice_basics.sql`](/downloads/postgresql/01_practice_basics.sql) | Modules 1–10 | A **practice** database with three simple tables: 30 books, 20 customers and 30 sales. There are no keys yet, and some values are missing or have messy spacing and capitals on purpose. |
| [`02_bookstore.sql`](/downloads/postgresql/02_bookstore.sql) | Modules 11–17 | A **bookstore** database with 11 connected tables, keys and constraints. It includes every kind of relationship: one-to-many, many-to-many, one-to-one, and a table that points to itself (employees and their managers). |
| [`03_bookstore_growth.sql`](/downloads/postgresql/03_bookstore_growth.sql) | Intermediate level | Adds 5,020 customers, about 39,000 orders, payments with refunds, time zones, JSON and list-style columns, and a messy imported customer list to clean up. |
| [`04_bookstore_big_data.sql`](/downloads/postgresql/04_bookstore_big_data.sql) | Optional, after the course | Adds 2 million website events (about 200 MB) with no extra indexes, for practising query speed with `EXPLAIN ANALYZE` and indexes on your own. It's too big for the browser, so it's Mac-only. |

Order matters: 03 needs 02, and 04 needs 03.

### How to run a file

Save the files into one folder. The course uses `~/Documents/sql` (Module 3 creates it). Then, in Terminal:

```bash
cd ~/Documents/sql
psql -d postgres -f 01_practice_basics.sql
psql -d practice
```

Swap in the file you need, and use `psql -d bookstore` for files 02 to 04.

**Why `-d postgres`?** Without `-d`, psql tries to open a database named after you (your Mac username), which doesn't exist, so you'd get an error. The files build their own database, so they only need somewhere to start from, and `postgres` is always there.

### Starting over

Broke something while practising? Run the file again.

- `01` rebuilds **practice** from scratch.
- `02` rebuilds **bookstore** from scratch. This also removes what 03 and 04 added, so run those again afterwards if you need them.
- `03` refuses to run twice. Run `02` first, then `03`.
- `04` rebuilds only the website-events table.

The generated data comes out exactly the same every time, so your answers stay the same each time you rebuild.

## A psql tip worth knowing early

Backslash commands (`\dt`, `\l`, `\c` …) **end at the end of the line**. They don't use semicolons, and you can't put SQL after them on the same line:

```text
\dt                          ✓
SELECT * FROM books;         ✓  (on its own line)
\dt SELECT * FROM books;     ✗  psql treats "SELECT", "*", … as extra arguments to \dt
```
