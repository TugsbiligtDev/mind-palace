# Take it to your Mac

Every lesson has an editor and a live preview right on the page, so you never *need* to install anything. But real websites are folders of files on your computer, opened in a real editor and a real browser. This page sets that up on a Mac. Modules 2 and 3 walk through it slowly.

## 1. A browser with good developer tools

Safari works, but most web developers build in **Chrome** or **Firefox** and test in all three. Install at least one of them from its official site. Every browser has **DevTools**: right-click anything on a page and choose **Inspect**.

In Safari, first turn them on: **Safari → Settings → Advanced → Show features for web developers**.

## 2. VS Code

Download **Visual Studio Code** from [code.visualstudio.com](https://code.visualstudio.com) and drag it into Applications. Then add two extensions from its Extensions panel (the four-squares icon):

- **Live Server** (by Ritwick Dey): opens your page in the browser and reloads it every time you save.
- **Prettier** (by Prettier): tidies your code's spacing when you save. Module 37 sets it up properly.

## 3. Your first project folder

In Finder, make a folder called `websites` inside your home folder, and inside it a folder called `inkwell`. Open VS Code, choose **File → Open Folder…**, and pick `inkwell`. Create a file called `index.html`, type `!` and press Tab (that's Emmet, Module 3), then save.

Right-click `index.html` and choose **Open with Live Server**. Your page opens in the browser.

## 4. Git (later)

Module 35 introduces Git, which keeps a history of your project. To check whether it's installed, open Terminal (⌘ + Space, type *Terminal*) and run:

```bash
git --version
```

macOS may offer to install the command-line developer tools the first time. Say yes.
