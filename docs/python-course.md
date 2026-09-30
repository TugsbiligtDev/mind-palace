# Python Course Plan

The owner's full roadmap for the Python course: 56 modules across three levels. Each module is one lesson on the site with its own quiz. Lessons live in `content/python/<level>/<folder>/`. Course id: `python`.

🔹 = a brief, recognition-only item (a short "just recognize it" step in the lesson).
⭐ = optional branch.

## Status

| Level | Modules | Status |
|---|---|---|
| Beginner: Fundamentals | 1–21, four case reviews, capstone | Built (branch `content/python-beginner`) |
| Intermediate: Essential+ | 22–40, four case reviews, capstone | Built (same branch) |
| Intermediate optional branches | 41–42 (⭐ Data Handling, ⭐ FastAPI) | Planned (need pandas and a web server, which the browser runner can't give us yet) |
| Advanced: Mastery | 43–54, plus optional 55–56 | Planned (not to be built yet) |

## What runs where

Lessons run real Python inside the browser (Pyodide, in a Web Worker, so an endless loop can't freeze the page). The first visit downloads about 10 MB; after that it is cached.

- **Runs in the browser:** everything in the language itself, the standard library (`math`, `random`, `datetime`, `zoneinfo`, `json`, `csv`, `re`, `collections`, `itertools`, `functools`, `dataclasses`, `enum`, `abc`, `logging`, `argparse`, `sqlite3`, `unittest.mock`), and these packages: pytest (real pytest runs the learner's tests), Pydantic v2, SQLAlchemy 2.0, httpx (against a fake server), BeautifulSoup. Files are written to a small in-memory disk that resets on every run.
- **`input()`** can't ask a person in the middle of a run. Lessons that use it feed the program a fixed list of typed answers (`stdin`), shown next to the code.
- **Mac steps only** (a step that says "On your Mac"): the terminal, `uv`, Git and GitHub, VS Code and the debugger, Ruff, mypy, pytest-cov, pre-commit, Typer, pydantic-settings, real HTTP requests, `.env` files, subprocess, cron/launchd. The learner pastes back what Terminal printed and the lesson checks it. The learner pastes back what Terminal printed, and the lesson checks it.
- **Simulated in the browser:** web APIs (a fake response is handed to the code, so the parsing, validation and error handling are real), and mocking with `unittest.mock`.

Python version taught: **3.14** (the browser runs Pyodide 314, which is real Python 3.14). Every snippet and every graded answer is run by `pnpm check:content` on that same engine before the site can be built.

---

## Beginner: Fundamentals

### Part 1: Computing & Tool Foundations

| # | Module | Folder | Covers |
|---|---|---|---|
| 1 | How Computers & Programs Work | `01-how-computers-work` | CPU, memory (RAM), storage; files and folders; what a programming language is; interpreted vs. compiled (Python's interpreter runs your code line by line); what version numbers like "3.14" mean; 🔹 Python 2 (dead since 2020; avoid tutorials that use it) |
| 2 | The Terminal on macOS | `02-terminal-macos` | Terminal and shell (macOS uses zsh); paths (absolute vs. relative, `~`, `.`, `..`); `pwd`, `ls`, `cd`, `mkdir`, `touch`, `mv`, `cp`, `rm` (and why `rm` is dangerous); tab-completion and history; common mistake: running commands in the wrong folder |
| 3 | Your First Programs | `03-first-programs` | The REPL vs. `.py` files; `print()`; comments; running scripts with `uv run`; indentation as syntax; reading tracebacks bottom-up; SyntaxError vs. runtime errors |

✅ **Checkpoint:** From the terminal only, create a project folder, write a script that prints a short multi-line "about me" card, run it, then deliberately break it and read the error. *(Case review `review-1-first-steps` plus a Mac checkpoint step.)*

### Part 2: Core Language *(prerequisite: Part 1)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 4 | Variables & Basic Types | `04-variables-types` | Variables as names pointing to values; int, float, str, bool, None; `type()`; dynamic typing; snake_case naming (PEP 8); float imprecision (`0.1 + 0.2 != 0.3`) |
| 5 | Operators & Expressions | `05-operators` | Arithmetic (`+ - * / // % **`); `/` vs. `//`; comparisons; `and`/`or`/`not`; precedence; `+=`; 🔹 walrus operator `:=` |
| 6 | Strings | `06-strings` | Indexing and slicing; immutability; key methods (split, join, strip, replace, lower, upper, startswith, find); f-strings (the standard); escape characters; multi-line strings; 🔹 `%` and `.format()` (legacy); 🔹 t-strings (new in 3.14) |
| 7 | Input & Type Conversion | `07-input-conversion` | `input()`; `int()`, `float()`, `str()`, `bool()`; common mistake: `input()` always returns a string |
| 8 | Conditionals | `08-conditionals` | if/elif/else; truthiness (`0`, `""`, `[]`, `None` are "false"); chained comparisons; `==` vs. `is` (use `is` only for `None`); early returns vs. deep nesting |
| 9 | Loops | `09-loops` | `while`; `for` over sequences; `range()`; break/continue; `enumerate()` and `zip()`; common mistakes: infinite loops, off-by-one errors, modifying a list while looping over it; 🔹 for/else |

✅ **Checkpoint:** A number-guessing game with limited attempts, hints ("too high/low"), input checking, and a play-again loop. *(Case review `review-2-core-language`.)*

### Part 3: Data Structures *(prerequisite: Part 2)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 10 | Lists | `10-lists` | Indexing and slicing; mutability; append, extend, insert, pop, remove, sort, index; `sorted()` vs. `.sort()`; `in`; nested lists; unpacking (`a, b = pair`, `first, *rest = items`) |
| 11 | Tuples & Sets | `11-tuples-sets` | Tuples as immutable sequences; sets for uniqueness and fast membership; union, intersection, difference; common mistake: `{}` is an empty dict, not a set |
| 12 | Dictionaries | `12-dictionaries` | `[]` vs. `.get()`; adding, updating, deleting; `.items()`, `.keys()`, `.values()`; nested dicts (the shape of JSON data); hashable keys; insertion order |
| 13 | Comprehensions, References & Copying | `13-comprehensions-copying` | List, dict, and set comprehensions; filtering; when a comprehension is too complex; aliasing (two names, one list); shallow vs. deep copy; classic bug: `[[0]*3]*3` |

✅ **Checkpoint:** A contact book held in memory: add, search, update, delete, and list contacts sorted by name, using dicts inside a list. *(Case review `review-3-data-structures`.)*

### Part 4: Functions & Program Organization *(prerequisite: Part 3)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 14 | Functions | `14-functions` | `def`, parameters, `return`; positional vs. keyword arguments; defaults; `*args`/`**kwargs`; scope (LEGB lookup order); docstrings; pure functions vs. side effects; mutable-default-argument bug; 🔹 `global`/`nonlocal` |
| 15 | Modules & the Standard Library | `15-modules-stdlib` | `import`, `from … import`, aliases; splitting code across files; `if __name__ == "__main__":`; `math`, `random`, `datetime`, `pathlib`, `os`, `sys`; reading docs.python.org |
| 16 | Errors & Exceptions | `16-exceptions` | try/except/else/finally; catch specific exceptions (never a bare `except:`); ValueError, TypeError, KeyError, IndexError, FileNotFoundError; `raise`; print-debugging and the VS Code debugger basics |
| 17 | Working with Files | `17-files` | `open()` with `with`; read/write/append modes; UTF-8 encoding; `pathlib.Path` (preferred over `os.path`); CSV with `csv`; JSON with `json`; common mistake: relative paths depend on where you run the script |

✅ **Checkpoint:** Upgrade the contact book: split it into modules and functions, save to and load from a JSON file, and handle every bad-input and missing-file case without crashing. *(Case review `review-4-functions-and-files`.)*

### Part 5: Working Like a Programmer *(prerequisite: Parts 1–4)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 18 | Git & GitHub Basics | `18-git-github` | Version control; init, add, commit, status, log, diff; `.gitignore` (exclude `.venv` and secrets); pushing to GitHub; cloning; good commit messages; undoing simple mistakes |
| 19 | Packages & Environments with uv | `19-uv-packages` | Packages and PyPI; why virtual environments exist; `uv init`, `uv add`, `uv remove`, `uv run`, `uv sync`; `pyproject.toml` and `uv.lock`; `uv python install`; never install into the macOS system Python; 🔹 pip/venv/requirements.txt (older projects); 🔹 conda |
| 20 | Problem-Solving Skills | `20-problem-solving` | Breaking problems into steps; pseudocode; tracing code by hand; searching errors effectively; reading documentation; using AI assistants to learn (ask for explanations, not just answers) |
| 21 | Algorithmic Thinking | `21-algorithmic-thinking` | What an algorithm is; Big-O intuition (O(1), O(n), O(n²), O(log n)) with everyday examples; linear search vs. binary search; how sorting works conceptually (write selection sort once, then use `sorted()` forever); why `in` is fast on sets/dicts but slow on lists; recursion basics (base case, recursive case, RecursionError). *Prerequisite: Modules 10–14* |

✅ **Checkpoint:** Put the contact book on GitHub as a uv project with a clear README and meaningful commits. Add a fast lookup by phone number using a dict index, and explain in the README why it's faster than searching the list. *(A Mac checkpoint step at the end of Module 21.)*

**Beginner capstone:** A command-line personal finance tracker: add, list, and summarize transactions stored in JSON; categories with fast lookups; robust input handling; on GitHub as a uv project. *(Folder `capstone-1-finance-tracker`.)*

---

## Intermediate: Essential+

### Part 6: Object-Oriented Programming *(prerequisite: Part 4)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 22 | Classes & Objects | `22-classes-objects` | `class`, `__init__`, `self`; instance attributes and methods; class vs. instance attributes (the shared-mutable bug); `@classmethod`/`@staticmethod`; when a class is and isn't the right tool |
| 23 | Inheritance & Composition | `23-inheritance-composition` | Subclassing; `super()`; overriding; `isinstance()`; composition over inheritance; abstract base classes (`abc.ABC`, `@abstractmethod`); 🔹 multiple inheritance and MRO |
| 24 | Special Methods & Data Classes | `24-special-methods-dataclasses` | `__str__`, `__repr__`, `__eq__`, `__lt__`, `__len__`, `__iter__`, `__contains__`; `@property`; `@dataclass` (frozen, field, order); `enum.Enum`; 🔹 `__slots__`; 🔹 `namedtuple` |

✅ **Checkpoint:** A library-management system with Book, Member, and Library classes (data classes where appropriate), borrowing and return rules, and custom string output. *(Case review `review-5-library-system`.)*

### Part 7: Pythonic Code *(prerequisite: Parts 4 & 6)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 25 | Iterators & Generators | `25-iterators-generators` | `iter`/`next`; `yield`; generator expressions; lazy evaluation; `itertools` (chain, islice, groupby, product); 🔹 `yield from` |
| 26 | Functions as Objects | `26-functions-as-objects` | First-class functions; `lambda`; `key=` in sorted/min/max; map/filter vs. comprehensions; closures; `functools` (partial, cache, lru_cache); 🔹 `reduce` |
| 27 | Decorators | `27-decorators` | How decorators work; writing them; `functools.wraps`; real uses (timing, logging, caching, access checks); decorators with arguments. *Prerequisite: Module 26* |
| 28 | Context Managers | `28-context-managers` | `with` in depth; `contextlib.contextmanager`; `__enter__`/`__exit__`; uses (files, locks, transactions, temporary state) |
| 29 | Structural Pattern Matching | `29-pattern-matching` | `match`/`case`; literal, capture, sequence, mapping, and class patterns; guards; when `match` beats if/elif |
| 30 | Standard Library Essentials | `30-stdlib-essentials` | `collections` (Counter, defaultdict, deque); `datetime` with `zoneinfo` (naive vs. aware bug); `re` basics; `argparse`; `subprocess`; `shutil`; `logging` (levels, handlers, why it beats print) |

✅ **Checkpoint:** A log-file analyzer that streams a large log with a generator, parses lines with regex, counts errors by type with Counter, times itself with a decorator, and takes options via argparse. *(Case review `review-6-log-analyzer`.)*

### Part 8: Problem-Solving Patterns *(prerequisites: Module 21, Part 7)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 31 | Data Structures & Algorithm Patterns | `31-algorithm-patterns` | Stacks (list) and queues (`deque`); priority queues with `heapq`; hash-map patterns (counting, grouping, deduplication); two pointers; sliding window; binary search with `bisect`; choosing structures by their Big-O costs |
| 32 | Recursion, Trees & Graphs | `32-recursion-trees-graphs` | Recursion in depth; memoization with `@cache`; trees (nodes, traversal); graphs (adjacency lists); breadth-first search (BFS) and depth-first search (DFS); shortest path on a grid; 🔹 dynamic programming basics; 🔹 Dijkstra's algorithm |

✅ **Checkpoint:** A maze solver that reads a maze from a text file and finds the shortest path with BFS, prints the solved maze, and compares DFS on the same input. *(Case review `review-7-maze-solver`.)*

### Part 9: Code Quality *(prerequisites: Parts 6–7)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 33 | Type Hints | `33-type-hints` | Why types help; annotating variables, parameters, returns; `list[int]`, `dict[str, int]`, `X | None`; `TypedDict`; `Literal`; type aliases; mypy or pyright; hints aren't enforced at runtime; 🔹 `List`/`Optional`/`Union` (legacy spellings) |
| 34 | Testing with pytest | `34-testing-pytest` | Plain `assert`; test discovery; fixtures; parametrize; `pytest.raises`; mocking (`unittest.mock`, monkeypatch); coverage (pytest-cov); test-driven development intro; 🔹 `unittest` |
| 35 | Linting, Formatting & Style | `35-linting-formatting` | PEP 8; Ruff as linter and formatter; configuring in `pyproject.toml`; pre-commit hooks; docstring styles; naming and readability |
| 36 | Debugging in Depth | `36-debugging` | `breakpoint()` and pdb; VS Code debugger (breakpoints, watches, stepping, conditional breakpoints); logging for diagnosis; minimal reproducible examples; reading library source |

✅ **Checkpoint:** Retrofit the library system: full type hints passing a type checker in strict mode, Ruff-clean, a pytest suite with fixtures and parametrized tests at high coverage, and pre-commit hooks. *(Case review `review-8-quality-retrofit`. mypy strict, Ruff and coverage run on the Mac; the browser checks type hints and runs the learner's tests against buggy copies of the code.)*

### Part 10: Real-World Python (Required Core) *(prerequisites: Parts 5 & 9)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 37 | HTTP & Web APIs | `37-http-web-apis` | Requests/responses, status codes, headers, methods; JSON APIs; `httpx` (or `requests`); API keys and tokens; environment variables and `.env` files; timeouts, retries, rate limits; never commit secrets to GitHub |
| 38 | Databases & SQL | `38-databases-sql` | Tables, rows, keys, relationships; SELECT, WHERE, JOIN, INSERT, UPDATE, DELETE, GROUP BY; `sqlite3`; parameterized queries vs. SQL injection; SQLAlchemy 2.0 ORM basics; 🔹 Alembic migrations |
| 39 | Data Validation with Pydantic | `39-pydantic` | Models and fields; validation errors; parsing JSON into typed objects; pydantic-settings; Pydantic v2 (v1 is legacy). *Prerequisite: Module 33* |
| 40 | Automation & Command-Line Tools | `40-automation-cli` | CLIs with `argparse` or Typer; file and folder automation; Excel/CSV work; scraping basics with `httpx` + BeautifulSoup (respect site terms); 🔹 scheduling on macOS (launchd/cron) |

✅ **Checkpoint:** A CLI that fetches data from a public API (for example, weather or books), validates it with Pydantic, stores it in SQLite, and supports querying history. Fully typed and tested with mocked HTTP. *(Combined with the Intermediate capstone: `capstone-2-reading-tracker`, an Open Library book tracker.)*

**Intermediate capstone:** A personal knowledge or reading tracker built on the required core (API data, SQLite, Pydantic, typed and tested, Ruff-clean), extended by your branch: data-analysis notebooks (A) or a REST API (B). *(Folder `capstone-2-reading-tracker`, built on the required core only.)*

### Part 11: ⭐ Optional Branches *(pick at least one; prerequisite: Part 10)*

| # | Module | Covers |
|---|---|---|
| ⭐ 41 | Branch A: Data Handling | Jupyter notebooks (and their pitfalls); NumPy arrays; pandas DataFrames (loading, filtering, grouping, cleaning, merging); 🔹 Polars; plotting with Matplotlib |
| ⭐ 42 | Branch B: Web Backends with FastAPI | What a backend is; routes and methods; path/query parameters; Pydantic request/response models; automatic API docs; dev server; 🔹 Flask, Django (each is its own track) |

✅ **Checkpoint A:** Analyze a real public dataset (clean, explore, chart) and publish the notebook plus findings on GitHub.
✅ **Checkpoint B:** Turn the Part 10 CLI's storage into a REST API with create/read/update/delete endpoints and tests.

*Not built yet: they need pandas and a live web server. They show as "planned" at the end of the Intermediate level.*

---

## Advanced: Mastery *(planned, not to be built yet)*

### Part 12: Language Mastery *(prerequisite: Intermediate required core)*

- **Module 43 — Python's Data Model:** everything is an object; identity, equality, hashing; the full dunder protocol picture; descriptors (how `@property` works); attribute lookup order; 🔹 metaclasses.
- **Module 44 — Advanced Typing:** modern generics syntax (`def first[T](xs: list[T]) -> T`, `class Box[T]:`); `Protocol`; `Callable`; `Final`, `ClassVar`; `@overload`; `TypeGuard`/`TypeIs`; strict mode; typing third-party code; 🔹 `ParamSpec`/`TypeVarTuple`.
- **Module 45 — Error-Handling Design:** custom exception hierarchies; `raise … from …`; EAFP vs. LBYL; exception notes; where to catch vs. propagate; 🔹 `ExceptionGroup`/`except*`.

✅ **Checkpoint:** A small typed library (for example, a unit-conversion or money-handling library) with a custom container type implementing the dunder protocols, generics, a Protocol-based plugin interface, and a clean exception hierarchy.

### Part 13: Concurrency & Performance *(prerequisite: Part 12)*

- **Module 46 — Concurrency Fundamentals:** I/O-bound vs. CPU-bound; threads vs. processes; the GIL in practice; `concurrent.futures`; race conditions and locks; 🔹 free-threaded (no-GIL) builds.
- **Module 47 — Async with asyncio:** `async`/`await`; event loop; coroutines vs. tasks; `gather` and `TaskGroup`; timeouts and cancellation; `httpx.AsyncClient`; blocking-call and missing-await mistakes; when not to use async. *Prerequisite: Module 46.*
- **Module 48 — Performance & Profiling:** Big-O review applied to real code; `timeit`; `cProfile` and visualizers; 🔹 new profiling package (3.15); memory profiling basics; caching; NumPy vectorization; 🔹 when to reach for compiled extensions (deferred).

✅ **Checkpoint:** A concurrent website-health checker that checks hundreds of URLs three ways (sequential, threads, asyncio) and reports measured speedups, with a profiling write-up of the slowest version.

### Part 14: Professional Software Engineering *(prerequisites: Parts 9, 12)*

- **Module 49 — Project Structure & Packaging:** `src/` layout; `pyproject.toml` in depth (metadata, extras, entry points); build backends; semantic versioning; `uv build`, `uv publish`, trusted publishing to PyPI; dependency pinning for apps vs. libraries.
- **Module 50 — Software Design:** separation of concerns; SOLID applied pragmatically; dependency injection the Python way; patterns that actually appear in Python (strategy, factory, adapter, repository); refactoring with tests; designing public APIs; avoiding over-engineering.
- **Module 51 — Advanced Testing:** unit vs. integration vs. end-to-end; fakes vs. mocks (and when mocking hurts); property-based testing with Hypothesis; testing async code; fast, reliable tests; 🔹 test containers.
- **Module 52 — Security Essentials:** secrets management; input validation; SQL and command injection; `eval`/`exec`/`pickle` on untrusted data; `pip-audit`; supply-chain basics (lock files, trusted sources); password hashing (never roll your own).
- **Module 53 — CI & Automated Quality:** GitHub Actions workflows running lint, type-check, and tests on every push; test matrices across Python versions; branch protection; automated dependency updates.
- **Module 54 — Working in Real Codebases:** navigating large unfamiliar code; code review; documentation (README, MkDocs); contributing to open source (issues, forks, pull requests); working with AI coding assistants responsibly (review everything, use tests as guardrails).

✅ **Checkpoint:** Package the Part 12 library properly, add Hypothesis tests, a security audit step, and a full CI pipeline, then publish it to TestPyPI. Separately, get one pull request merged into a real open-source project, even a documentation fix.

### Part 15: ⭐ Optional Advanced Branches *(prerequisite: Part 14)*

- ⭐ **Module 55 — Docker & Deployment:** images and containers; writing a Python Dockerfile (using uv, slim images, non-root user); environment-based configuration; structured logging and basic monitoring; deploying to a cloud platform.
- ⭐ **Module 56 — Production Web APIs with FastAPI:** dependency injection in FastAPI; authentication (OAuth2/JWT basics); async database access; background tasks; error handling; API testing; running behind a production server. *(Prerequisites: Modules 42, 47, 55.)*

✅ **Checkpoint:** Containerize and deploy the Branch B API with authentication and async database access, with CI deploying it automatically.

---

## Capstone Projects
- **Beginner:** A command-line personal finance tracker: add, list, and summarize transactions stored in JSON; categories with fast lookups; robust input handling; on GitHub as a uv project.
- **Intermediate:** A personal knowledge or reading tracker built on the required core (API data, SQLite, Pydantic, typed and tested, Ruff-clean), extended by your branch: data-analysis notebooks (A) or a REST API (B).
- **Advanced:** A production-grade async service, such as a link-monitoring or job-aggregation service. It has a packaged, typed core library, async HTTP, a database, a comprehensive test suite including property-based tests, a security audit, and CI. If you took the branches, it's also containerized, authenticated, and deployed.

## Final Skills
- **After Beginner:** You can write working programs of a few hundred lines; use the terminal, Git, and uv; handle files and bad input; read tracebacks; and reason about which data structure makes code fast.
- **After Intermediate:** You write idiomatic, typed, tested Python; design with classes; solve algorithmic problems with standard patterns (hash maps, BFS/DFS, sliding window); build CLIs that use APIs and databases; and have one applied specialty. This is roughly junior-developer level.
- **After Advanced:** You can design, build, test, secure, package, and ship real Python software; write concurrent and async code; profile and optimize; make sound design trade-offs; and contribute to professional and open-source codebases.

## === NOT COVERED / DEFERRED ===
CPython internals and bytecode (`dis`); garbage collection and memory tuning; import system internals; metaclasses in depth; descriptors in depth; C extensions, Cython, and Rust extensions (PyO3/maturin); free-threading internals; JIT compiler internals; PyPy and alternative interpreters; asyncio internals and custom event loops; advanced algorithms (dynamic programming in depth, advanced graph algorithms, competitive programming); distributed task queues (Celery, Dramatiq); distributed computing (Dask, Ray, PySpark); Django in depth; GUI desktop apps (PySide/Qt, Tkinter); game development (pygame); MicroPython and embedded hardware; machine learning and deep learning (scikit-learn, PyTorch); LLM/AI application development; data engineering and orchestration (Airflow, Dagster); SciPy and scientific computing in depth; advanced visualization and dashboards; Kubernetes and large-scale deployment; cross-platform binary wheels (cibuildwheel); cryptography in depth; raw socket network programming.
