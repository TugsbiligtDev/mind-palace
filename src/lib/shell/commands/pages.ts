// Manual pages (`man`) and tldr pages for the commands the course teaches. They're shortened
// versions, written for the course, in the shape of the real ones: NAME, SYNOPSIS, DESCRIPTION,
// OPTIONS. Shell built-ins such as cd, alias and export have no man page on Ubuntu either:
// `help cd` explains those.

export function man(name: string, summary: string, synopsis: string, description: string, options: [string, string][], extra = ""): string {
  const opts = options.map(([o, d]) => `       ${o}\n              ${d}\n`).join("\n");
  const title = `${name.toUpperCase()}(1)`;
  const header = `${title}${" ".repeat(Math.max(1, 60 - title.length * 2))}User Commands${" ".repeat(4)}${title}`;
  return (
    `${header}\n\n` +
    `NAME\n       ${name} - ${summary}\n\n` +
    `SYNOPSIS\n       ${synopsis}\n\n` +
    `DESCRIPTION\n       ${description.replace(/\n/g, "\n       ")}\n\n` +
    (options.length ? `OPTIONS\n${opts}\n` : "") +
    (extra ? `${extra.trim()}\n\n` : "") +
    `(Shortened for the practice terminal. The full page is on any Linux machine: man ${name})\n`
  );
}

export const MAN_PAGES: Record<string, string> = {
  ls: man("ls", "list directory contents", "ls [OPTION]... [FILE]...", "List information about the FILEs (the current directory by default).\nEntries are sorted alphabetically.", [
    ["-a, --all", "do not ignore entries starting with . (hidden files)"],
    ["-A, --almost-all", "like -a, but leave out . and .."],
    ["-d, --directory", "list directories themselves, not their contents"],
    ["-F, --classify", "append a character showing the type: / folder, * program, @ link"],
    ["-h, --human-readable", "with -l, print sizes like 1K 234M 2G"],
    ["-l", "use a long listing format: permissions, links, owner, group, size, date, name"],
    ["-r, --reverse", "reverse the order while sorting"],
    ["-R, --recursive", "list subdirectories recursively"],
    ["-S", "sort by file size, largest first"],
    ["-t", "sort by modification time, newest first"],
    ["-1", "list one file per line"],
  ]),
  pwd: man("pwd", "print name of current/working directory", "pwd [OPTION]...", "Print the full filename of the current working directory.", []),
  mkdir: man("mkdir", "make directories", "mkdir [OPTION]... DIRECTORY...", "Create the DIRECTORY(ies), if they do not already exist.", [
    ["-p, --parents", "no error if existing, make parent directories as needed"],
    ["-v, --verbose", "print a message for each created directory"],
  ]),
  touch: man("touch", "change file timestamps", "touch [OPTION]... FILE...", "Update the access and modification times of each FILE to the current time.\nA FILE argument that does not exist is created empty.", [
    ["-c, --no-create", "do not create any files"],
  ]),
  cp: man("cp", "copy files and directories", "cp [OPTION]... SOURCE DEST\n       cp [OPTION]... SOURCE... DIRECTORY", "Copy SOURCE to DEST, or multiple SOURCE(s) to DIRECTORY.", [
    ["-i, --interactive", "prompt before overwrite"],
    ["-n, --no-clobber", "do not overwrite an existing file"],
    ["-r, -R, --recursive", "copy directories recursively"],
    ["-v, --verbose", "explain what is being done"],
  ]),
  mv: man("mv", "move (rename) files", "mv [OPTION]... SOURCE DEST\n       mv [OPTION]... SOURCE... DIRECTORY", "Rename SOURCE to DEST, or move SOURCE(s) to DIRECTORY.", [
    ["-i, --interactive", "prompt before overwrite"],
    ["-n, --no-clobber", "do not overwrite an existing file"],
    ["-v, --verbose", "explain what is being done"],
  ]),
  rm: man(
    "rm",
    "remove files or directories",
    "rm [OPTION]... [FILE]...",
    "rm removes each specified file. By default, it does not remove directories.\nThere is no undo: removed files do not go to a trash folder.",
    [
      ["-f, --force", "ignore nonexistent files and arguments, never prompt"],
      ["-i", "prompt before every removal"],
      ["-r, -R, --recursive", "remove directories and their contents recursively"],
      ["-d, --dir", "remove empty directories"],
      ["-v, --verbose", "explain what is being done"],
    ],
  ),
  rmdir: man("rmdir", "remove empty directories", "rmdir [OPTION]... DIRECTORY...", "Remove the DIRECTORY(ies), if they are empty.", []),
  cat: man("cat", "concatenate files and print on the standard output", "cat [OPTION]... [FILE]...", "Concatenate FILE(s) to standard output.\nWith no FILE, or when FILE is -, read standard input.", [
    ["-n, --number", "number all output lines"],
    ["-A, --show-all", "show invisible characters: $ at line ends, ^I for tabs"],
  ]),
  less: man(
    "less",
    "view a file one screen at a time",
    "less [FILE]",
    "less shows a text file one screen at a time, and lets you move back and forth.\n\nKEYS\n  Space or f     forward one screen\n  b              back one screen\n  Down / Up      one line\n  /word          search forward for word; n for the next match\n  g / G          go to the start / end\n  q              quit",
    [],
  ),
  head: man("head", "output the first part of files", "head [OPTION]... [FILE]...", "Print the first 10 lines of each FILE to standard output.", [
    ["-n, --lines=[-]NUM", "print the first NUM lines instead of the first 10"],
    ["-c, --bytes=NUM", "print the first NUM bytes"],
  ]),
  tail: man("tail", "output the last part of files", "tail [OPTION]... [FILE]...", "Print the last 10 lines of each FILE to standard output.", [
    ["-n, --lines=NUM", "output the last NUM lines; -n +NUM starts at line NUM"],
    ["-f, --follow", "keep the file open and print new lines as they are added (Ctrl+C to stop)"],
  ]),
  wc: man("wc", "print newline, word, and byte counts for each file", "wc [OPTION]... [FILE]...", "Print newline, word, and byte counts for each FILE, and a total line if more\nthan one FILE is given.", [
    ["-l, --lines", "print the newline counts"],
    ["-w, --words", "print the word counts"],
    ["-c, --bytes", "print the byte counts"],
    ["-m, --chars", "print the character counts"],
  ]),
  echo: man("echo", "display a line of text", "echo [OPTION]... [STRING]...", "Echo the STRING(s) to standard output.", [
    ["-n", "do not output the trailing newline"],
    ["-e", "enable interpretation of backslash escapes such as \\n and \\t"],
  ]),
  grep: man(
    "grep",
    "print lines that match patterns",
    "grep [OPTION...] PATTERNS [FILE...]",
    "grep searches for PATTERNS in each FILE and prints each line that matches.\nWith no FILE, it reads standard input (for example, from a pipe).",
    [
      ["-i, --ignore-case", "ignore case distinctions in patterns and data"],
      ["-v, --invert-match", "select non-matching lines"],
      ["-n, --line-number", "prefix each line of output with its line number"],
      ["-c, --count", "print only a count of matching lines per file"],
      ["-r, --recursive", "read all files under each directory, recursively"],
      ["-l, --files-with-matches", "print only the names of files with a match"],
      ["-w, --word-regexp", "match only whole words"],
      ["-E, --extended-regexp", "use extended regular expressions"],
    ],
    "EXIT STATUS\n       0 if a line is selected, 1 if no lines were selected, 2 if an error occurred.",
  ),
  find: man(
    "find",
    "search for files in a directory hierarchy",
    "find [starting-point...] [expression]",
    "find walks the folder tree from each starting point and prints every file that\nmatches the expression. With no expression, it prints everything.",
    [
      ["-name pattern", "file name matches pattern (quote it: -name '*.txt')"],
      ["-iname pattern", "like -name, but ignoring case"],
      ["-type d / -type f", "only directories / only regular files"],
      ["-maxdepth n", "go at most n levels below the starting point"],
      ["-size +n[kM]", "bigger than n (kilobytes or megabytes)"],
      ["-mtime -n", "modified less than n days ago"],
    ],
  ),
  chmod: man(
    "chmod",
    "change file mode bits",
    "chmod [OPTION]... MODE[,MODE]... FILE...\n       chmod [OPTION]... OCTAL-MODE FILE...",
    "chmod changes the permissions of each FILE.\n\nSymbolic modes: who (u user, g group, o others, a all), then + - or =, then\nwhich permissions (r read, w write, x execute). Example: chmod u+x script.sh\n\nNumeric modes: one digit each for user, group and others, adding\nr=4, w=2, x=1. Example: chmod 644 notes.txt (rw-r--r--).",
    [["-R, --recursive", "change files and directories recursively"]],
  ),
  chown: man("chown", "change file owner and group", "chown [OPTION]... [OWNER][:[GROUP]] FILE...", "Change the owner and/or group of each FILE. Only root can give files away.", [
    ["-R, --recursive", "operate on files and directories recursively"],
  ]),
  sudo: man(
    "sudo",
    "execute a command as another user",
    "sudo command [arg ...]",
    "sudo runs a command as the superuser (root), if the security policy allows it.\nOn Ubuntu, members of the sudo group may use it. It asks for YOUR password,\nnot root's. Everything the command does is done with full rights, so read\nthe command twice first.",
    [],
  ),
  man: man("man", "an interface to the system reference manuals", "man [SECTION] PAGE", "man finds and shows the manual page for a command.\nInside the page: Space for the next screen, b to go back, /word to search, q to quit.", []),
  nano: man(
    "nano",
    "a small, friendly text editor",
    "nano [FILE]",
    "nano opens FILE for editing (it is created when you save). The shortcuts are\nlisted at the bottom of the screen; ^ means the Ctrl key.\n\n  Ctrl+O   write out (save)\n  Ctrl+X   exit (asks to save if there are changes)\n  Ctrl+K   cut the current line\n  Ctrl+U   paste\n  Ctrl+W   search",
    [],
  ),
  which: man("which", "locate a command", "which [-a] COMMAND...", "which prints the full path of the program the shell would run for each COMMAND,\nby searching the folders in $PATH in order.", [["-a", "print all matches, not just the first"]]),
  history: man("history", "show the command history", "history [N]", "(A shell built-in.) Lists the commands you've typed, numbered. Run one again with !N.\n!! repeats the last command.", [["-c", "clear the history"]]),
  sort: man("sort", "sort lines of text files", "sort [OPTION]... [FILE]...", "Write sorted lines of all FILE(s) to standard output.", [
    ["-n, --numeric-sort", "compare by number, so 10 comes after 9"],
    ["-r, --reverse", "reverse the result"],
    ["-u, --unique", "output only the first of equal lines"],
    ["-k, --key=POS", "sort by field POS (fields are separated by blanks)"],
    ["-t, --field-separator=SEP", "use SEP between fields instead of blanks"],
  ]),
  uniq: man("uniq", "report or omit repeated lines", "uniq [OPTION]... [INPUT [OUTPUT]]", "Filter adjacent matching lines, writing one copy of each. Lines must be sorted\nfirst (sort | uniq) for duplicates far apart to be merged.", [
    ["-c, --count", "prefix lines by the number of occurrences"],
    ["-d, --repeated", "only print duplicate lines"],
  ]),
  cut: man("cut", "remove sections from each line of files", "cut OPTION... [FILE]...", "Print selected parts of lines.", [
    ["-d, --delimiter=DELIM", "use DELIM instead of TAB as the field delimiter"],
    ["-f, --fields=LIST", "select only these fields, for example -f 1,3"],
    ["-c, --characters=LIST", "select only these characters"],
  ]),
  tee: man("tee", "read from standard input and write to standard output and files", "tee [OPTION]... [FILE]...", "Copy standard input to each FILE, and also to standard output.", [["-a, --append", "append to the given FILEs, do not overwrite"]]),
  date: man("date", "print or set the system date and time", "date [OPTION]... [+FORMAT]", "Display the current time in the given FORMAT. Example: date +%Y-%m-%d", [["-u, --utc", "print Coordinated Universal Time (UTC)"]]),
  whoami: man("whoami", "print effective user name", "whoami", "Print the user name of the current user.", []),
  clear: man("clear", "clear the terminal screen", "clear", "Clear the screen. Ctrl+L does the same.", []),
  tldr: man("tldr", "simplified, community-made help pages", "tldr COMMAND", "Show a few common examples of COMMAND, shorter than its man page.", []),
  tree: man("tree", "list contents of directories in a tree-like format", "tree [-a] [-L level] [directory ...]", "Draw the folders and files under each directory as a tree.", [
    ["-a", "include hidden files"],
    ["-L level", "go at most level folders deep"],
    ["-d", "list directories only"],
  ]),
  git: man(
    "git",
    "the stupid content tracker",
    "git [--version] [--help] <command> [<args>]",
    "Git is a fast, scalable, distributed version control system.\n\nMost-used commands: init, clone, add, status, diff, commit, restore, log,\nbranch, switch, merge, remote, push, fetch, pull.\n\nEach command has its own help: git help <command>, or git <command> -h.",
    [],
  ),
};

// The tldr pages follow the tldr-pages project (https://tldr.sh, CC BY 4.0), shortened.
export function tldr(name: string, summary: string, examples: [string, string][]): string {
  return `\n  \x1b[1m${name}\x1b[0m\n\n  ${summary}\n\n${examples.map(([d, c]) => `  - ${d}:\n\n    \x1b[36m${c}\x1b[0m\n`).join("\n")}\n`;
}

export const TLDR_PAGES: Record<string, string> = {
  ls: tldr("ls", "List directory contents.", [
    ["List files one per line", "ls -1"],
    ["List all files, including hidden files", "ls -a"],
    ["Long format list (permissions, ownership, size, and modification date) of all files", "ls -la"],
    ["Long format list with size in human-readable units (KiB, MiB, GiB)", "ls -lh"],
    ["Long format list sorted by size (descending)", "ls -lS"],
    ["Long format list of all files, sorted by modification date (oldest first)", "ls -ltr"],
  ]),
  cd: tldr("cd", "Change the current working directory.", [
    ["Go to the specified directory", "cd path/to/directory"],
    ["Go up to the parent of the current directory", "cd .."],
    ["Go to the home directory of the current user", "cd"],
    ["Go to the previously chosen directory", "cd -"],
  ]),
  cp: tldr("cp", "Copy files and directories.", [
    ["Copy a file to another location", "cp path/to/source_file path/to/target_file"],
    ["Copy a file into another directory, keeping the filename", "cp path/to/source_file path/to/target_parent_directory"],
    ["Recursively copy a directory's contents to another location", "cp -r path/to/source_directory path/to/target_directory"],
    ["Copy multiple files at once to a directory", "cp -t path/to/destination_directory path/to/file1 path/to/file2"],
  ]),
  mv: tldr("mv", "Move or rename files and directories.", [
    ["Rename a file or directory", "mv path/to/source path/to/target"],
    ["Move a file or directory into an existing directory", "mv path/to/source path/to/existing_directory"],
    ["Do not prompt for confirmation before overwriting existing files", "mv -f path/to/source path/to/target"],
    ["Prompt for confirmation before overwriting existing files", "mv -i path/to/source path/to/target"],
  ]),
  rm: tldr("rm", "Remove files or directories.", [
    ["Remove specific files", "rm path/to/file1 path/to/file2"],
    ["Remove specific files ignoring nonexistent ones", "rm -f path/to/file1 path/to/file2"],
    ["Remove specific files interactively prompting before each removal", "rm -i path/to/file1 path/to/file2"],
    ["Remove a directory and all its contents recursively", "rm -r path/to/directory"],
  ]),
  mkdir: tldr("mkdir", "Create directories.", [
    ["Create specific directories", "mkdir path/to/directory1 path/to/directory2"],
    ["Create specific directories and their parents if needed", "mkdir -p path/to/directory1 path/to/directory2"],
  ]),
  grep: tldr("grep", "Find patterns in files using regular expressions.", [
    ["Search for a pattern within a file", "grep \"search_pattern\" path/to/file"],
    ["Search in case-insensitive mode", "grep -i \"search_pattern\" path/to/file"],
    ["Show line numbers of matches", "grep -n \"search_pattern\" path/to/file"],
    ["Search recursively in a directory", "grep -r \"search_pattern\" path/to/directory"],
    ["Print lines that do NOT match", "grep -v \"search_pattern\" path/to/file"],
    ["Search the output of another command", "command | grep \"search_pattern\""],
  ]),
  find: tldr("find", "Find files or directories under a directory tree, recursively.", [
    ["Find files by extension", "find path/to/directory -name '*.ext'"],
    ["Find directories only", "find path/to/directory -type d"],
    ["Find files by name, ignoring case", "find path/to/directory -iname 'name*'"],
    ["Find files modified in the last 7 days", "find path/to/directory -mtime -7"],
  ]),
  tar: tldr("tar", "Archiving utility.", [
    ["Create a gzipped archive from files", "tar czf path/to/target.tar.gz path/to/file1 path/to/file2"],
    ["Extract a (compressed) archive file into the current directory", "tar xf path/to/source.tar.gz"],
    ["List the contents of a tar file", "tar tvf path/to/source.tar"],
  ]),
  chmod: tldr("chmod", "Change the access permissions of a file or directory.", [
    ["Give the [u]ser who owns a file the right to e[x]ecute it", "chmod u+x path/to/file"],
    ["Give the [u]ser rights to [r]ead and [w]rite to a file/directory", "chmod u+rw path/to/file_or_directory"],
    ["Remove e[x]ecutable rights from the [g]roup", "chmod g-x path/to/file"],
    ["Set permissions with numbers: owner rw, everyone else read", "chmod 644 path/to/file"],
  ]),
  head: tldr("head", "Output the first part of files.", [
    ["Output the first few lines of a file", "head -n count path/to/file"],
  ]),
  tail: tldr("tail", "Display the last part of a file.", [
    ["Show last 'count' lines in file", "tail -n count path/to/file"],
    ["Print a file from a specific line number", "tail -n +count path/to/file"],
    ["Keep reading file until Ctrl+C", "tail -f path/to/file"],
  ]),
  git: tldr("git", "Distributed version control system.", [
    ["Check the Git version", "git --version"],
    ["Show general help", "git --help"],
    ["Show help on a Git subcommand (like clone, add, push, log, etc.)", "git help subcommand"],
    ["Execute a Git subcommand", "git subcommand"],
  ]),
  "git-commit": tldr("git commit", "Commit files to the repository.", [
    ["Commit staged files to the repository with a message", "git commit --message \"message\""],
    ["Automatically stage all modified and deleted files and commit", "git commit --all --message \"message\""],
    ["Replace the last commit with currently staged changes", "git commit --amend"],
  ]),
};
