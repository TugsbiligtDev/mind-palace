# Take it to your Mac

Every lesson has a practice terminal on the page, so you never *need* to install anything. But the point of this course is your own computer. This page gets your Mac ready; the lessons' **On your Mac** steps use it.

## 1. Terminal

Your Mac already has it: press **⌘ + Space**, type *Terminal*, press Return. Right-click its Dock icon and choose **Options → Keep in Dock**.

Your Mac's shell is **zsh** (the prompt ends in `%`). The practice terminal is **bash** on Linux (the prompt ends in `$`). For everything in the Beginner level they behave the same; lessons point out the few differences.

## 2. Homebrew

Homebrew installs command-line tools (Module 12). Copy the install command **from [brew.sh](https://brew.sh) itself**, paste it into Terminal, and follow the "Next steps" it prints at the end. Then:

```bash
brew doctor
brew install git gh tree tldr
```

## 3. Git

Module 14 sets it up. The short version, with your own name and the email you'll use on GitHub:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --global init.defaultBranch main
git config --global core.editor nano
```

## 4. GitHub

Module 18 walks through it: create an account at [github.com](https://github.com), turn on two-factor authentication, make an SSH key and give it to GitHub, and log in the GitHub CLI:

```bash
ssh-keygen -t ed25519 -C "you@example.com"
gh auth login
ssh -T git@github.com
```

## 5. A practice folder

Keep experiments away from your real files:

```bash
mkdir -p ~/terminal-practice
cd ~/terminal-practice
```

⚠️ Your Mac's terminal is real: `rm` deletes for good, and `sudo` can change anything. When a lesson's command could delete or overwrite something, try it in the practice terminal first.
