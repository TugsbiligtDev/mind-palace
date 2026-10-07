# Linux Command Line + Git/GitHub Course Plan

The owner's full roadmap for the Linux Command Line + Git/GitHub course: 56 modules across three levels, plus a capstone project per level. Each module is one lesson on the site with its own knowledge check. Lessons live in `content/linux-git/<level>/<folder>/`. Course id: `linux-git`.

🔹 = a brief, recognition-only item (a short "just recognize it" step in the lesson).

## Status

| Level | Modules | Status |
|---|---|---|
| Beginner: Fundamentals | 1–21, three case reviews, capstone | **Built** (branch `content/linux-git`, waiting for the owner's review) |
| Intermediate: Essential+ | 22–41, three case reviews, capstone | **Built** (branch `content/linux-git`, waiting for the owner's review) |
| Advanced: Mastery | 42–56, reviews, capstone | Planned (not built yet) |

Build order follows the other courses: Beginner first, then Intermediate once the owner has seen and approved Beginner on a preview link.

## What runs where

This course uses a sixth engine, **`shell`**: a **practice terminal** right in the lesson. The learner types real commands and the site checks the result.

- **The practice terminal** is a simulated Linux computer that lives in the browser tab (built on [just-bash](https://github.com/vercel-labs/just-bash), a bash shell written in TypeScript with its own in-memory files). It has a home folder (`/home/learner`), a prompt like `learner@inkwell:~$`, and the everyday commands: `ls`, `cd`, `mkdir`, `cp`, `mv`, `rm`, `cat`, `head`, `tail`, `wc`, `grep`, `find`, `sort`, `uniq`, `cut`, `sed`, `awk`, pipes, redirection, variables, scripts. Nothing the learner types can touch their real computer.
- **Added by the site** (written in `src/lib/shell/`): `ls -l` with real permissions, `chmod` that matters ("Permission denied" when a file isn't readable, writable or executable), `sudo`, `man` and `tldr` pages for the commands the course teaches, a small `nano` editor that opens over the terminal, `history`, `!!`, aliases that last between commands, Tab completion, Up-arrow history, Ctrl+R search and the line-editing shortcuts (Ctrl+A/E/U/W/L, Ctrl+C).
- **Git** is a simulation written for the course (`src/lib/shell/git/`): real commit hashes (SHA-1), a real `.git` folder, and output that matches real Git as closely as possible: `init`, `config`, `status`, `add`, `commit`, `log`, `diff`, `restore`, `rm`, `mv`, `switch`, `branch`, `merge` (with real conflicts and `--abort`), `add --resolved`, `checkout`, `remote`, `clone`, `push`, `fetch`, `pull`. A "GitHub" remote is a folder inside the simulated computer, so pushes, rejected pushes and pulls all behave for real without the internet. Intermediate adds `stash`, `reset`, `revert`, `rebase`, `cherry-pick`, `tag`, `reflog`, `blame`.
- **Grading** works like the other courses: each graded step has a set-up script (the files the task starts with), a reference solution, and hidden checks (commands such as `ls -a ~/case` or `git log --format=%s`). The checks run on the learner's computer and on a fresh computer where the solution was run; the answers must match. A step can also check what the learner's last command printed (for "find the line that…" tasks). The check runs after every command, so the step completes the moment the task is done.
- **Shared set-ups** live in `content/linux-git/fixtures/` (`backoffice`, `git-identity`, `website-repo`, `github-account`, `github-site`, `site-clone`); a step names them with `fixture:` and they run before its own `setup`. The website repository's commits use fixed authors and dates, so their IDs are the same for everyone (e.g. `7d2afa2` "Add checkout settings").
- **GitHub** is simulated too: `ssh-keygen`, `ssh -T git@github.com`, `ssh-add`, and a GitHub CLI (`gh auth`, `gh ssh-key`, `gh repo create/view/list/clone`, `gh pr create/list/view/diff/merge/checkout`, `gh issue create/list/view/close`). The learner's account is `learner`; SSH pushes need a key added to GitHub, HTTPS needs `gh auth login`.
- **Mac steps** ("On your Mac") cover what a browser can't: the real Terminal app, Finder, `open`, VS Code (`code .`), Homebrew, real `vim`, SSH keys, GitHub accounts, `gh`, pull requests on github.com. Each one is optional.
- **The content check** (`pnpm check:content linux-git`) runs every graded step in the same simulated shell in Node: every solution command must succeed (unless marked `# allow-error`), the solution must pass its own checks, the starter state must not, and every listed wrong answer must be rejected. It simulates the learner at a different time than the reference run, so a check whose output depends on the clock (a commit ID, `ls -l` dates) fails there instead of in the browser. Quizzes are multiple choice, fill-in with `runnable: false`, and predict-the-output questions whose answers are checked by running the commands in the simulated shell.

Running example: the learner tidies up **Inkwell Books'** back-office files (orders, notes, logs, the website's source) and puts them under version control, from the story bible's bookstore.

Season 1 story (*The Back Office*): Inkwell's shared files are a mess, and Inspector Bold sends you in to sort them out from the terminal. Along the way you find that the store's payment key was committed to the website's repository at some point. The case reviews follow the trail through file timestamps, logs and finally `git log`, and the capstone is the cleanup: your own notes + dotfiles repository, pushed to GitHub.

---

## Beginner: Fundamentals

*Season goal: from "I've never opened a terminal" to managing files from the command line and keeping your own projects on GitHub.*

### Part 1: Computer & Terminal Foundations

| # | Module | Folder | Covers |
|---|---|---|---|
| 1 | How Your Computer Is Organized | `01-computer-organized` | What an operating system is; files, folders ("directories") and file extensions; programs vs. commands; Unix, Linux and macOS, and why Mac terminal skills transfer to Linux |
| 2 | Meeting the Terminal | `02-meeting-terminal` | Terminal vs. shell vs. command line; zsh (Mac default) vs. bash (Linux default); reading the prompt; anatomy of a command (command, options/flags, arguments); first commands (`pwd`, `whoami`, `date`, `echo`, `clear`); case sensitivity; cancelling with Ctrl+C; common mistake: unquoted spaces in names |
| 3 | Getting Help & Reading Errors | `03-help-errors` | `man` pages and how to exit them; `--help`; `tldr`; decoding "command not found", "No such file or directory" and "Permission denied"; searching for an error effectively; using AI assistants to explain a command; best practice: never run a pasted command you don't understand |

### Part 2: Navigating & Managing Files

| # | Module | Folder | Covers |
|---|---|---|---|
| 4 | The File System & Paths | `04-file-system-paths` | The directory tree; root `/` and home `~`; absolute vs. relative paths; `.` and `..`; `cd`, `ls` (`-l`, `-a`, `-h`); hidden "dotfiles"; Tab completion; 🔹 Linux folder layout vs. macOS (preview only) |
| 5 | Creating, Copying, Moving, Deleting | `05-create-copy-move-delete` | `mkdir -p`, `touch`, `cp -r`, `mv` (also renames), `rm`, `rm -r`, `rm -i`; there is no Trash, so `rm` is permanent; wildcards (`*`, `?`, `[ ]`); quoting and escaping; `open` (macOS only); common mistake: a wildcard that matches more than intended |
| 6 | Viewing & Editing Text | `06-viewing-editing-text` | Plain text vs. rich text; `cat`, `less`, `head`, `tail`, `tail -f`, `wc`; editing with `nano`; opening folders in VS Code with `code .`; 🔹 vim (how to quit only; full coverage in Module 26) |
| 7 | Working Faster | `07-working-faster` | Command history, Up arrow, Ctrl+R search; line-editing shortcuts (Ctrl+A/E/U/W/L); `!!`; temporary aliases |

✅ **Case review `review-1-files`:** sort out Inkwell's messy shared folder from a written brief: find your way around, build the folder structure, move and rename files, read the notes. No step-by-step instructions.

### Part 3: Core Shell Concepts *(prerequisite: Part 2)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 8 | Redirection & Pipes | `08-redirection-pipes` | Standard input, output and error; `>`, `>>`, `<`, `2>`; the pipe `\|` and chaining small tools; common mistake: `>` silently overwrites a file; 🔹 `tee` |
| 9 | Finding Things | `09-finding-things` | `grep` (`-i`, `-r`, `-n`, `-v`); `find` by name and type; `which` and `type`; 🔹 `mdfind` (macOS) and `locate` (Linux) |
| 10 | Permissions & sudo | `10-permissions-sudo` | Users and groups; reading `rwx` in `ls -l`; `chmod` in symbolic and numeric form (644, 755); what `sudo` is and when it's justified; debugging "Permission denied"; common mistakes: `chmod 777`, reflexive `sudo`; 🔹 `chown` |
| 11 | Environment & Shell Configuration | `11-environment-config` | Variables, `$HOME`, `$PATH`, `export`; how the shell locates a command; `~/.zshrc` (and `~/.bashrc` on Linux); `source`; permanent aliases; debugging "command not found" as a PATH problem |
| 12 | Installing Software | `12-installing-software` | What a package manager is; Homebrew (`brew install`, `upgrade`, `list`, `uninstall`); formulae vs. casks; `/opt/homebrew` on Apple Silicon; `brew doctor`; 🔹 `apt` on Linux (covered in Module 22) |

✅ **Case review `review-2-shell`:** dig through Inkwell's server logs with pipes, `grep` and `find`, fix a script that won't run, and set up the shell so the agency's tools are on the PATH.

### Part 4: Git Fundamentals *(prerequisite: Parts 1–3)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 13 | What Version Control Is | `13-version-control` | The problem it solves; Git (the tool) vs. GitHub (the website); repository, commit, history; local vs. remote |
| 14 | First-Time Git Setup | `14-git-setup` | Apple's bundled Git vs. the current Git from Homebrew; `git config --global` for `user.name`, `user.email`, `init.defaultBranch main` and `core.editor`; where `~/.gitconfig` lives; 🔹 Git 3.0 will make `main` the default |
| 15 | The Core Loop | `15-core-loop` | `git init`; working directory, staging area, repository; `git status`; `git add`; `git commit -m`; writing good commit messages; `git log` (`--oneline`, `--graph`); `git diff` and `git diff --staged`; common mistakes: `git add .` without checking status, giant commits, vague messages |
| 16 | Ignoring & Simple Undo | `16-ignore-undo` | `.gitignore` patterns; `.DS_Store`; never commit passwords or keys; `git restore`; `git restore --staged`; `git commit --amend`; `git rm`, `git mv` |
| 17 | Branching & Merging Basics | `17-branching-merging` | A branch as a movable pointer; `HEAD`; `git switch`, `git switch -c`, `git branch`; `git merge`; fast-forward vs. merge commit; your first merge conflict (reading markers, fixing, staging with `git add` or the newer `git add --resolved`, Git 2.56); `git merge --abort`; deleting merged branches; 🔹 `git checkout` (older syntax, recognition only) |

✅ **Case review `review-3-git`:** the payment key. Put Inkwell's website folder under Git, follow its history to find when the key was committed, and fix it on a branch with a merge, conflict included.

### Part 5: GitHub Fundamentals *(prerequisite: Part 4)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 18 | Account & Authentication | `18-account-auth` | Creating an account; two-factor authentication and passkeys; SSH keys (`ssh-keygen` with ed25519, `ssh-agent`, macOS Keychain, adding the key to GitHub); HTTPS vs. SSH URLs; GitHub CLI (`gh auth login`); debugging "Permission denied (publickey)"; 🔹 personal access tokens |
| 19 | Remotes | `19-remotes` | `git remote -v`; `origin`; `git clone`; `git push -u`; `git fetch` vs. `git pull`; `main` vs. `origin/main`; debugging a rejected push |
| 20 | Repository Essentials | `20-repo-essentials` | Creating repos on the web and with `gh repo create`; README and Markdown basics; licenses; public vs. private; browsing history and blame on the web; Issues basics |
| 21 | The Pull Request Workflow (Solo) | `21-pull-requests` | Feature branch → push → open PR → read the diff → merge → delete branch → pull main; "GitHub Flow"; 🔹 merge button options (detail in Module 38) |

**Beginner capstone** *(folder `capstone-1-notes-dotfiles`)*: build a personal "notes + dotfiles" project entirely from the terminal. Organize the folders, add your own aliases to `.zshrc`, track it with Git, create and resolve a deliberate merge conflict, push to GitHub over SSH, and merge your own pull request. The folder, aliases, Git history and conflict are graded in the practice terminal; the push and pull request happen on the Mac.

---

## Intermediate: Essential+

*Season 2, The Server Room: the shop moves to a real server, and the agency finds the doors Marcus left open (a hidden program on the office server, his key on the shop server's `deploy` account, a cookie-stealing script and a force-push on the website).*

What the practice terminal adds for this level (all in `src/lib/shell/`): processes and jobs (`ps`, `top`, `kill`, `&`, Ctrl+Z, `fg`, `bg`), `apt` with a pretend package archive, services and logs (`systemctl`, `journalctl`), users and groups, `crontab`, a second and third computer to SSH into (`shop.inkwell.example`, `backup.inkwell.example`; password `bookworm`) with `scp`, `rsync`, `ssh-copy-id`, `~/.ssh/config` and host-key checks, `curl`/`wget`/`ping`/`dig`/`ss`/`ip`/`ufw` over a pretend network, vim, ShellCheck, zip, and Git's `reset`, `revert`, `cherry-pick`, `rebase` (incl. `-i` and `--autosquash`), `stash`, `tag`, `blame`, `add -p`, `clean`. The pretend GitHub adds forks, reviews, labels, milestones, releases, rulesets (refused pushes), push protection for secrets, and GitHub Actions that really run workflows (`gh run`, `gh workflow`, `gh secret`, Pages). Shared set-ups: `shop-logs`, `shop-server`, `shop-access`, `website-more`, `logtool-*`. A solution line can end in `# answers: y n` or `# edit: <sed script>` for prompts and editors the content check can't type into.

Case reviews: `review-4-night-shift` (after Part 7), `review-5-deploy-account` (after Part 8), `review-6-rewritten-history` (after Part 9).

### Part 6: Real Linux & Text Processing *(prerequisite: Parts 1–3)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 22 | A Real Linux Environment on Your Mac | `22-real-linux` | What a distribution is (Debian/Ubuntu vs. Fedora/RHEL families); running Ubuntu (ARM64) in a lightweight virtual machine on the M2; bash vs. zsh differences; GNU vs. BSD tool differences (`sed -i`, `date`, `ls` flags); Linux folder layout (`/etc`, `/var`, `/home`, `/usr`, `/opt`, `/tmp`); `apt update`, `upgrade`, `install`, `remove`, `search`; 🔹 `dnf`; 🔹 `/proc` |
| 23 | Text Processing Toolkit | `23-text-processing` | Regular expression basics (anchors, character classes, quantifiers, `grep -E`); `cut`, `sort`, `uniq -c`, `tr`; `sed` substitution; `awk` for columns and simple conditions; `xargs`; building pipelines step by step; `jq` for JSON; 🔹 modern alternatives `rg`, `fd`, `fzf` |
| 24 | Processes & Jobs | `24-processes-jobs` | What a process and PID are; `ps`, `top`, `htop`; `kill` and signals (SIGINT, SIGTERM, SIGKILL); background jobs (`&`, `jobs`, `fg`, `bg`, Ctrl+Z); exit codes and `$?`; chaining with `&&`, `\|\|`, `;`; 🔹 `nohup` |
| 25 | Archives, Disk, Downloads, Links | `25-archives-disk-links` | `tar` (create, extract, gzip), `zip`/`unzip`; `df -h`, `du -sh`; `curl` (`-O`, `-L`, `-I`, headers); symbolic links with `ln -s`; 🔹 `wget`; 🔹 hard links |
| 26 | Terminal Editor Survival | `26-vim-survival` | vim modes; insert, save, quit, search, undo, delete and copy lines; why it matters (servers, Git prompts); nano as the fallback |

### Part 7: Shell Scripting *(prerequisite: Part 3, Modules 23–24)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 27 | Script Basics | `27-script-basics` | The shebang line (`#!/usr/bin/env bash`); `chmod +x`; variables; single vs. double quotes; command substitution `$( )`; arguments (`$1`, `$@`, `$#`); `read`; macOS ships old bash 3.2, so install current bash with Homebrew |
| 28 | Control Flow | `28-control-flow` | `if`/`elif`/`else`; `[[ ]]` tests for files, strings and numbers; `for` and `while` loops; `case`; functions; `return` and exit codes |
| 29 | Robust Scripts | `29-robust-scripts` | `set -euo pipefail`; always quoting variables; ShellCheck; tracing with `set -x`; here-documents; common pitfalls (word splitting, parsing `ls` output, unquoted wildcards); knowing when a task has outgrown bash |

### Part 8: Remote Machines *(prerequisite: Modules 10, 18, 22)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 30 | SSH | `30-ssh` | Client and server; `ssh user@host`; keys vs. passwords; `~/.ssh/config`; `known_hosts` and host-key warnings; `scp` and `rsync`; 🔹 port forwarding (`-L`); 🔹 agent forwarding and its risk |
| 31 | Basic Linux Administration | `31-linux-admin` | Users and groups (`adduser`, `usermod`, `passwd`, `groups`); granting sudo; services with `systemctl` (`status`, `start`, `stop`, `restart`, `enable`); logs with `journalctl` and `/var/log`; scheduling with cron; 🔹 systemd timers |
| 32 | Networking from the Command Line | `32-networking` | IP addresses, ports, DNS, localhost; `ping`, `curl -v`, `dig`, `ss -tulpn`, `ip addr`; "connection refused" vs. "timed out"; 🔹 `ifconfig` and `netstat` (legacy); 🔹 `ufw` firewall (detail in Module 45) |

### Part 9: Git Beyond the Basics *(prerequisite: Parts 4–5)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 33 | Git's Mental Model | `33-git-mental-model` | Commits as snapshots with parents; the commit graph; hashes; branches and tags as pointers; `HEAD` and "detached HEAD"; remote-tracking branches; 🔹 SHA-1 today, SHA-256 by default in Git 3.0 |
| 34 | Undoing with Confidence | `34-undoing` | `restore` vs. `reset` (`--soft`, `--mixed`, `--hard`) vs. `revert`; `git reflog` as the safety net; recovering deleted branches and lost commits; `git clean`; rule: rewrite only history you haven't shared |
| 35 | Rebase & History Shaping | `35-rebase` | Merge vs. rebase; `git rebase main`; `git pull --rebase`; interactive rebase (reword, squash, fixup, drop, reorder); `--fixup` with `--autosquash`; `git push --force-with-lease` and never plain `--force`; 🔹 `git history` (experimental newer command) |
| 36 | Everyday Power Tools | `36-power-tools` | `git stash` (`push`, `pop`, `list`, `-u`); `git add -p`; `git cherry-pick`; tags (annotated vs. lightweight) and semantic versioning; log filtering (`--author`, `--since`, `-S`, `-- path`); `git show`; `git blame`; comparing branches (`..` vs. `...`); Git aliases; `git branch --delete-merged` |
| 37 | Conflict Mastery | `37-conflict-mastery` | Why conflicts happen; conflicts during merge, rebase and cherry-pick; three-way markers (`zdiff3` style); the VS Code merge editor; `--ours` and `--theirs`; `--continue` and `--abort`; avoiding conflicts with small branches and frequent syncing; 🔹 `rerere` |

### Part 10: Collaborating on GitHub *(prerequisite: Part 9)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 38 | Team Pull Request Workflow | `38-team-prs` | Forks vs. branches; the upstream remote and syncing a fork; PR descriptions; draft PRs; linking issues (`Closes #12`); requesting and giving reviews; suggested changes; review etiquette; merge commit vs. squash vs. rebase-merge; updating a PR branch; 🔹 stacked PRs (public preview) |
| 39 | Project Management & the GitHub CLI | `39-project-management` | Issues, labels, milestones; issue and PR templates; Projects boards; CODEOWNERS; CONTRIBUTING.md; Releases and release notes; `gh pr create`, `checkout`, `review`, `merge`; `gh issue`; `gh repo`; 🔹 Discussions |
| 40 | Repository Protection & Hygiene | `40-repo-protection` | Rulesets (the current mechanism); required reviews and status checks; `.gitattributes` and line endings; secret scanning and push protection; Dependabot alerts; what to do after committing a secret (revoke it first, then clean history); 🔹 classic branch protection rules |
| 41 | GitHub Actions Basics | `41-actions-basics` | What continuous integration is; workflow file anatomy (`on`, `jobs`, `runs-on`, `steps`, `uses`, `run`); triggers (`push`, `pull_request`, `workflow_dispatch`); using published actions; secrets and variables; reading logs and debugging failed runs; checks on PRs; publishing a site with GitHub Pages |

**Intermediate capstone** *(folder `capstone-2-log-tool`)*: write a bash log-analysis tool on your Ubuntu VM that summarizes a web server log and runs on a cron schedule. Develop it through feature branches and PRs with clean rebased history, protect `main` with a ruleset, run ShellCheck in GitHub Actions on every PR, and publish a tagged release.

---

## Advanced: Mastery

*Planned, not built yet.*

### Part 11: Advanced Shell & Linux *(prerequisite: Parts 6–8)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 42 | Advanced Bash Scripting | `42-advanced-bash` | Arrays and associative arrays; parameter expansion (`${var:-default}`, `${var%.*}`, `${var//a/b}`); option parsing with `getopts`; `trap` for cleanup and signals; process substitution `<( )`; subshells; `mktemp`; logging and error-handling patterns; 🔹 bats testing |
| 43 | Advanced Text & Data Processing | `43-advanced-text` | Regex in depth (groups, alternation, greedy matching, basic vs. extended vs. Perl-style); full awk programs (`BEGIN`/`END`, variables, arrays, aggregation); multi-command and addressed sed; jq filters, `select`, `map`; log-analysis pipelines; `xargs -P` for parallel work; 🔹 GNU parallel |
| 44 | System Troubleshooting & Performance | `44-troubleshooting` | A systematic method (CPU, memory, disk, network); load average; `htop`, `free`, `vmstat`, `df`, `du`, `lsof`; disk-full and out-of-memory diagnosis; `journalctl` filtering by unit, time and priority; 🔹 `iostat`; 🔹 `strace` |
| 45 | Services & Server Hardening | `45-hardening` | Writing systemd unit files (service and timer, restart policies, environment files); SSH hardening (keys only, no root login); `ufw` firewall rules; automatic security updates; least privilege; `umask`; 🔹 setuid, setgid and sticky bits; 🔹 ACLs; 🔹 fail2ban |
| 46 | Terminal Productivity | `46-productivity` | tmux (sessions, windows, panes, detach and reattach); managing dotfiles in a Git repo; zsh customization (prompt, completions, autosuggestions, syntax highlighting); a workflow with `fzf`, `rg`, `fd`, `bat`, `zoxide`; 🔹 Oh My Zsh |

### Part 12: Advanced Git *(prerequisite: Part 9)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 47 | Git Internals (Practical) | `47-git-internals` | The `.git` directory; object types (blob, tree, commit, tag); `git cat-file`; how refs are stored; merge base and three-way merge; 🔹 packfiles and garbage collection; 🔹 reftable format (default in Git 3.0) |
| 48 | Debugging with Git | `48-debugging-git` | `git bisect` manually and with `bisect run`; `git blame` with `-L`, `-w`, `-C` and an ignore-revs file; pickaxe search (`-S`, `-G`); `git log -L` for line history; 🔹 `git range-diff` |
| 49 | Advanced Rewriting & Recovery | `49-rewriting-recovery` | `git rebase --onto`; splitting a commit; `git filter-repo` to purge secrets or large files; recovering from a bad rebase or force-push via reflog; 🔹 `filter-branch` (deprecated); 🔹 `git fsck` |
| 50 | Multiple Workspaces & Large Repositories | `50-workspaces-large-repos` | `git worktree`; sparse checkout; partial clone (`--filter=blob:none`) and shallow clone; Git LFS for large files; submodules and their pitfalls; `git maintenance`; 🔹 subtree |
| 51 | Hooks, Standards & Signing | `51-hooks-signing` | Client-side hooks (`pre-commit`, `commit-msg`, `pre-push`); the pre-commit framework; Conventional Commits; signing commits with an SSH key and the "Verified" badge; 🔹 GPG signing |
| 52 | Branching Strategies & Releases | `52-branching-strategies` | GitHub Flow vs. trunk-based development; release branches, hotfixes, backports with cherry-pick; version tags and changelogs; merge queues; 🔹 Git Flow (older model) |

### Part 13: Advanced GitHub *(prerequisite: Part 10)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 53 | Advanced GitHub Actions | `53-advanced-actions` | Matrix builds; dependency caching; artifacts; reusable workflows and composite actions; environments with approval gates; concurrency control; least-privilege `GITHUB_TOKEN` permissions; pinning actions to commit hashes; 🔹 OIDC cloud login; 🔹 self-hosted runners |
| 54 | Security & Supply Chain | `54-supply-chain` | Dependabot version updates; code scanning with CodeQL; security policies and private vulnerability reporting; requiring signed commits; organization-level rulesets; fine-grained tokens and least privilege; 🔹 GitHub Apps |
| 55 | Automating GitHub | `55-automating-github` | `gh api`; scripting with bash, `gh` and `jq`; `gh` aliases and extensions; 🔹 REST vs. GraphQL; 🔹 webhooks |
| 56 | Open Source & AI-Assisted Workflows | `56-open-source-ai` | Contributing end to end (finding issues, forking, project norms, review cycles); maintaining a project (triage, releases); automated Copilot code review and coding agents that open PRs; reviewing AI-written changes with the same rigor as human ones; 🔹 Codespaces and dev containers; 🔹 DCO/CLA sign-off |

**Advanced capstone** *(folder `capstone-3-server-pipeline`)*: bootstrap and harden a Linux server with your own script and run a small service on it as a systemd unit. Deploy through a GitHub Actions pipeline (matrix tests, reusable workflow, approval-gated deploy over SSH) with signed commits and pre-commit hooks. Then find a planted bug with `git bisect` and get a PR merged into a real open-source project.

---

## Final Skills

- **After Beginner:** navigate and manage any Mac or Linux machine from the terminal, install software, fix common errors, and keep your own projects under version control on GitHub.
- **After Intermediate:** work on real Linux servers over SSH, automate tasks with reliable scripts, process text and logs, collaborate on a team through reviewed PRs, recover from most Git mistakes, and set up basic CI.
- **After Advanced:** troubleshoot and secure Linux systems, write production-grade automation, untangle any Git history problem, design a team's branching and release process, and build secure CI/CD pipelines.

## Not covered / deferred

Linux kernel internals and kernel modules · eBPF and perf profiling · SELinux / AppArmor policy writing · LVM, RAID, filesystem tuning · nftables / iptables in depth · cgroups and namespaces internals · Docker and Kubernetes · Ansible, Terraform and other infrastructure tooling · advanced zsh scripting; POSIX sh portability; fish and nushell · Perl one-liners · Git plumbing commands in depth · custom merge drivers and diff drivers · `git notes`, `git replace`, `git bundle` · email patch workflow (`git send-email`, `git am`) · hosting your own Git server · SHA-1 to SHA-256 repository migration · monorepo operations at scale (Scalar, bitmaps, multi-pack indexes) · Jujutsu (jj) and Sapling · GitLab, Bitbucket, Gerrit · GitHub Enterprise administration (SAML, SCIM, audit logs) · building GitHub Apps · runner fleets at scale · GitHub Packages and container registry · GitHub Advanced Security administration
