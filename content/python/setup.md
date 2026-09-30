# Take it to your Mac

Everything in the lessons runs in your browser, so you never *need* to install anything to start. But real programmers run Python on their own computer, and a few lessons (the terminal, Git, `uv`, testing tools) can only be practised there. This page sets up a Mac with Apple Silicon.

## 1. Open Terminal

Press **⌘ + Space**, type *Terminal*, and press Enter. You will see a prompt ending in `%`. That is **zsh**, the shell macOS uses.

## 2. Install Homebrew

Homebrew installs developer tools with one command. Copy the install line from [brew.sh](https://brew.sh), paste it into Terminal, and follow the on-screen steps. Check it worked:

```bash
brew --version
```

## 3. Install uv (Python and packages)

`uv` installs Python itself and manages every project's libraries. It is the only Python tool you need.

```bash
brew install uv
uv --version
uv python install 3.14
```

**Never install libraries into the Python that ships with macOS.** It belongs to the system, and breaking it breaks the Mac. `uv` keeps each project in its own folder instead.

## 4. Run your first script

```bash
mkdir ~/hello && cd ~/hello
echo 'print("Hello from Python")' > hello.py
uv run hello.py
```

You should see `Hello from Python`.

## 5. An editor: VS Code

Install it with `brew install --cask visual-studio-code`, then open a folder with `code .`. Add the **Python** extension from its Extensions panel.

## 6. Git

```bash
git --version
```

macOS may offer to install the command-line developer tools the first time. Say yes. Later lessons cover `git` and GitHub step by step.
