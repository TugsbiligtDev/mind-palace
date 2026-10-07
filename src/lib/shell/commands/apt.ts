// apt, apt-get and dpkg: Ubuntu's package manager, over a small pretend archive. What's
// installed is kept in /var/lib/dpkg/status (the real file's format), so it survives like real
// state; installing a package adds its programs to /usr/bin, and a program that isn't installed
// answers the way Ubuntu does ("Command 'htop' not found, but can be installed with: …").
import type { Command } from "just-bash";
import type { Machine } from "../machine";
import { fail, ok, parseArgs } from "../util";

type Pkg = {
  name: string;
  version: string;
  section: string;
  sizeKb: number; // download
  installedKb: number;
  description: string;
  bins: string[];
  depends?: string[];
  pre?: boolean;
  /** The version an upgrade brings. */
  newer?: string;
};

export const PACKAGES: Pkg[] = [
  { name: "bash", version: "5.2.21-2ubuntu4", section: "shells", sizeKb: 794, installedKb: 1864, description: "GNU Bourne Again SHell", bins: ["bash"], pre: true },
  { name: "coreutils", version: "9.4-3ubuntu6", section: "utils", sizeKb: 1413, installedKb: 7136, description: "GNU core utilities", bins: [], pre: true },
  { name: "curl", version: "8.5.0-2ubuntu10.6", section: "web", sizeKb: 227, installedKb: 534, description: "command line tool for transferring data with URL syntax", bins: ["curl"], pre: true, newer: "8.5.0-2ubuntu10.7" },
  { name: "git", version: "1:2.56.0-0ppa1~ubuntu24.04.1", section: "vcs", sizeKb: 3954, installedKb: 22014, description: "fast, scalable, distributed revision control system", bins: ["git"], pre: true },
  { name: "nano", version: "7.2-2ubuntu0.1", section: "editors", sizeKb: 280, installedKb: 881, description: "small, friendly text editor inspired by Pico", bins: ["nano"], pre: true },
  { name: "vim", version: "2:9.1.0016-1ubuntu7.8", section: "editors", sizeKb: 1739, installedKb: 4152, description: "Vi IMproved - enhanced vi editor", bins: ["vim", "vi"], pre: true },
  { name: "openssh-server", version: "1:9.6p1-3ubuntu13.13", section: "net", sizeKb: 510, installedKb: 2072, description: "secure shell (SSH) server, for secure access from remote machines", bins: ["sshd"], pre: true, newer: "1:9.6p1-3ubuntu13.14" },
  { name: "openssh-client", version: "1:9.6p1-3ubuntu13.13", section: "net", sizeKb: 905, installedKb: 4920, description: "secure shell (SSH) client, for secure access to remote machines", bins: ["ssh", "scp", "ssh-keygen", "ssh-copy-id"], pre: true },
  { name: "libssl3t64", version: "3.0.13-0ubuntu3.5", section: "libs", sizeKb: 1940, installedKb: 6828, description: "Secure Sockets Layer toolkit - shared libraries", bins: [], pre: true, newer: "3.0.13-0ubuntu3.6" },
  { name: "tar", version: "1.35+dfsg-3build1", section: "utils", sizeKb: 256, installedKb: 948, description: "GNU version of the tar archiving utility", bins: ["tar"], pre: true },
  { name: "tree", version: "2.1.1-2ubuntu3", section: "utils", sizeKb: 47, installedKb: 117, description: "displays an indented directory tree, in color", bins: ["tree"], pre: true },
  { name: "htop", version: "3.3.0-4build1", section: "utils", sizeKb: 171, installedKb: 434, description: "interactive processes viewer", bins: ["htop"] },
  { name: "jq", version: "1.7.1-3build1", section: "utils", sizeKb: 65, installedKb: 104, description: "lightweight and flexible command-line JSON processor", bins: ["jq"], depends: ["libjq1"] },
  { name: "libjq1", version: "1.7.1-3build1", section: "libs", sizeKb: 141, installedKb: 386, description: "lightweight and flexible command-line JSON processor - shared library", bins: [] },
  { name: "shellcheck", version: "0.9.0-1", section: "devel", sizeKb: 2359, installedKb: 13814, description: "lint tool for shell scripts", bins: ["shellcheck"] },
  { name: "zip", version: "3.0-13ubuntu0.2", section: "utils", sizeKb: 176, installedKb: 541, description: "Archiver for .zip files", bins: ["zip"] },
  { name: "unzip", version: "6.0-28ubuntu4.1", section: "utils", sizeKb: 174, installedKb: 384, description: "De-archiver for .zip files", bins: ["unzip"] },
  { name: "net-tools", version: "2.10-0.1ubuntu4", section: "net", sizeKb: 204, installedKb: 816, description: "NET-3 networking toolkit (the old ifconfig, netstat, route)", bins: ["ifconfig", "netstat", "route"] },
  { name: "ripgrep", version: "14.1.0-1", section: "utils", sizeKb: 1508, installedKb: 5196, description: "Recursively searches directories for a regex pattern", bins: ["rg"] },
  { name: "fd-find", version: "9.0.0-1", section: "utils", sizeKb: 1080, installedKb: 3368, description: "Simple, fast and user-friendly alternative to find", bins: ["fdfind"] },
  { name: "fzf", version: "0.44.1-1ubuntu0.3", section: "utils", sizeKb: 1290, installedKb: 3608, description: "general-purpose command-line fuzzy finder", bins: ["fzf"] },
  { name: "bat", version: "0.24.0-1build1", section: "utils", sizeKb: 2302, installedKb: 6672, description: "cat(1) clone with syntax highlighting and git integration", bins: ["batcat"] },
  { name: "cowsay", version: "3.03+dfsg2-8", section: "games", sizeKb: 18, installedKb: 93, description: "configurable talking cow", bins: ["cowsay"] },
  { name: "nginx", version: "1.24.0-2ubuntu7.5", section: "httpd", sizeKb: 521, installedKb: 1468, description: "small, powerful, scalable web/proxy server", bins: ["nginx"], depends: ["nginx-common"] },
  { name: "nginx-common", version: "1.24.0-2ubuntu7.5", section: "httpd", sizeKb: 43, installedKb: 196, description: "small, powerful, scalable web/proxy server - common files", bins: [] },
];

const STATUS = "/var/lib/dpkg/status";
const LISTS = "/var/lib/apt/lists";

async function statusText(m: Machine): Promise<string> {
  return m.asRoot(async () => {
    try {
      return await m.fs.readFile(STATUS);
    } catch {
      return "";
    }
  });
}

type Installed = Map<string, string>;

async function readInstalled(m: Machine): Promise<Installed> {
  const out: Installed = new Map();
  for (const stanza of (await statusText(m)).split("\n\n")) {
    const name = /^Package: (.+)$/m.exec(stanza)?.[1];
    const version = /^Version: (.+)$/m.exec(stanza)?.[1];
    if (name && version && /^Status: install ok installed$/m.test(stanza)) out.set(name, version);
  }
  return out;
}

async function writeInstalled(m: Machine, inst: Installed) {
  const text = [...inst]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, version]) => {
      const p = PACKAGES.find((x) => x.name === name);
      return `Package: ${name}\nStatus: install ok installed\nPriority: optional\nSection: ${p?.section ?? "misc"}\nInstalled-Size: ${p?.installedKb ?? 100}\nArchitecture: amd64\nVersion: ${version}\nDescription: ${p?.description ?? name}\n`;
    })
    .join("\n");
  await m.asRoot(async () => {
    await m.fs.mkdir("/var/lib/dpkg", { recursive: true });
    await m.fs.writeFile(STATUS, text);
  });
}

/** Writes the packages a fresh Ubuntu server comes with (unless a set-up already did). */
export async function installBase(m: Machine) {
  if (!(await m.perms.exists(STATUS))) {
    await writeInstalled(m, new Map(PACKAGES.filter((p) => p.pre).map((p) => [p.name, p.version])));
    await m.asRoot(async () => {
      await m.fs.mkdir(LISTS, { recursive: true });
      await m.fs.writeFile(`${LISTS}/archive.ubuntu.com_ubuntu_dists_noble_InRelease`, "(package lists)\n");
    });
  }
  // Programs from packages that aren't installed aren't in /usr/bin.
  const inst = await readInstalled(m);
  await m.asRoot(async () => {
    for (const p of PACKAGES) if (!inst.has(p.name)) for (const b of p.bins) await m.fs.rm(`/usr/bin/${b}`, { force: true });
  });
}

export async function isInstalled(m: Machine, pkg: string): Promise<boolean> {
  return (await readInstalled(m)).has(pkg);
}

/** The package that provides a program, if it's one this archive knows. */
export function packageFor(bin: string): Pkg | undefined {
  return PACKAGES.find((p) => p.bins.includes(bin));
}

/** For commands that come from a package: refuses (like Ubuntu) when it isn't installed. */
export async function needPackage(m: Machine, bin: string) {
  const p = packageFor(bin);
  if (!p || (await isInstalled(m, p.name))) return undefined;
  return fail(`Command '${bin}' not found, but can be installed with:\nsudo apt install ${p.name}`, 127);
}

const NOT_ROOT = (verb: string) =>
  verb === "update"
    ? "Reading package lists... Done\nE: Could not open lock file /var/lib/apt/lists/lock - open (13: Permission denied)\nE: Unable to lock directory /var/lib/apt/lists/\nW: Problem unlinking the file /var/cache/apt/pkgcache.bin - RemoveCaches (13: Permission denied)\nW: Problem unlinking the file /var/cache/apt/srcpkgcache.bin - RemoveCaches (13: Permission denied)"
    : "E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?";

const kb = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)} MB` : `${n} kB`);

async function listsReady(m: Machine): Promise<boolean> {
  try {
    return (await m.asRoot(() => m.fs.readdir(LISTS))).some((n) => n.endsWith("InRelease"));
  } catch {
    return false;
  }
}

async function upgradable(m: Machine, inst: Installed): Promise<Pkg[]> {
  return PACKAGES.filter((p) => p.newer && inst.get(p.name) && inst.get(p.name) !== p.newer);
}

/** What installing a package does besides putting its programs in place. */
async function afterInstall(m: Machine, p: Pkg) {
  for (const b of p.bins) await m.asRoot(async () => {
    await m.fs.writeFile(`/usr/bin/${b}`, "#!/bin/sh\n# (built into the practice terminal)\n");
    await m.fs.chmod(`/usr/bin/${b}`, 0o755);
  });
  if (p.name === "nginx") {
    await m.asRoot(async () => {
      for (const d of ["/etc/nginx/sites-available", "/etc/nginx/sites-enabled", "/var/www/html"]) await m.fs.mkdir(d, { recursive: true });
      await m.fs.writeFile(
        "/etc/nginx/sites-available/default",
        "server {\n\tlisten 80 default_server;\n\tlisten [::]:80 default_server;\n\n\troot /var/www/html;\n\tindex index.html index.htm index.nginx-debian.html;\n\n\tserver_name _;\n\n\tlocation / {\n\t\ttry_files $uri $uri/ =404;\n\t}\n}\n",
      );
      if (!(await m.perms.exists("/etc/nginx/sites-enabled/default"))) await m.fs.symlink("/etc/nginx/sites-available/default", "/etc/nginx/sites-enabled/default");
      await m.fs.writeFile("/var/www/html/index.nginx-debian.html", "<!DOCTYPE html>\n<html>\n<head>\n<title>Welcome to nginx!</title>\n</head>\n<body>\n<h1>Welcome to nginx!</h1>\n<p>If you see this page, the nginx web server is successfully installed and\nworking. Further configuration is required.</p>\n</body>\n</html>\n");
      await m.fs.writeFile(
        "/usr/lib/systemd/system/nginx.service",
        "[Unit]\nDescription=A high performance web server and a reverse proxy server\nDocumentation=man:nginx(8)\nAfter=network-online.target\n\n[Service]\nType=forking\nExecStart=/usr/sbin/nginx -g 'daemon on; master_process on;'\nExecReload=/usr/sbin/nginx -g 'daemon on; master_process on;' -s reload\n\n[Install]\nWantedBy=multi-user.target\n",
      );
    });
    const u = await m.services.load("nginx");
    if (u) {
      await m.services.enable(u);
      await m.services.start(u);
    }
  }
}

async function afterRemove(m: Machine, p: Pkg) {
  for (const b of p.bins) await m.asRoot(() => m.fs.rm(`/usr/bin/${b}`, { force: true }));
  if (p.name === "nginx") {
    const u = await m.services.load("nginx");
    if (u) {
      await m.services.stop(u);
      await m.services.disable(u);
    }
    await m.asRoot(() => m.fs.rm("/usr/lib/systemd/system/nginx.service", { force: true }));
  }
}

async function apt(m: Machine, args: string[], tty: boolean, getStyle = false) {
  const { flags, long, operands } = parseArgs(args);
  const yes = flags.has("y") || long.includes("yes") || long.includes("assume-yes");
  const [verb, ...names] = operands;
  const warn = !tty && !getStyle ? "\nWARNING: apt does not have a stable CLI interface. Use with caution in scripts.\n\n" : "";
  const reading = "Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\n";
  const inst = await readInstalled(m);
  const root = m.perms.root;
  if (!verb) return ok("apt 2.8.3 (amd64)\nUsage: apt [options] command\n\nMost used commands:\n  list - list packages based on package names\n  search - search in package descriptions\n  show - show package details\n  install - install packages\n  remove - remove packages\n  update - update list of available packages\n  upgrade - upgrade the system by installing/upgrading packages\n  autoremove - automatically remove all unused packages\n");
  switch (verb) {
    case "update": {
      if (!root) return fail(NOT_ROOT("update"), 100);
      await m.asRoot(async () => {
        await m.fs.mkdir(LISTS, { recursive: true });
        await m.fs.writeFile(`${LISTS}/archive.ubuntu.com_ubuntu_dists_noble_InRelease`, "(package lists)\n");
      });
      const n = (await upgradable(m, inst)).length;
      return ok(
        `${warn}Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease\nGet:2 http://archive.ubuntu.com/ubuntu noble-updates InRelease [126 kB]\nGet:3 http://security.ubuntu.com/ubuntu noble-security InRelease [126 kB]\nHit:4 http://archive.ubuntu.com/ubuntu noble-backports InRelease\nFetched 252 kB in 1s (306 kB/s)\n${reading}${n ? `${n} package${n === 1 ? " can" : "s can"} be upgraded. Run 'apt list --upgradable' to see ${n === 1 ? "it" : "them"}.` : "All packages are up to date."}\n`,
      );
    }
    case "list": {
      let rows: string[];
      if (long.includes("upgradable")) rows = (await upgradable(m, inst)).map((p) => `${p.name}/noble-updates ${p.newer} amd64 [upgradable from: ${inst.get(p.name)}]`);
      else if (long.includes("installed")) rows = [...inst].sort().map(([n, v]) => `${n}/noble,now ${v} amd64 [installed]`);
      else rows = PACKAGES.filter((p) => !names.length || names.some((n) => new RegExp(`^${n.replace(/\*/g, ".*")}$`).test(p.name))).map((p) => `${p.name}/noble ${p.version} amd64${inst.has(p.name) ? " [installed]" : ""}`);
      return ok(`${warn}Listing... Done\n${rows.join("\n")}${rows.length ? "\n" : ""}`);
    }
    case "search": {
      const term = (names[0] ?? "").toLowerCase();
      if (!term) return fail("E: You must give at least one search pattern", 100);
      const hits = PACKAGES.filter((p) => p.name.includes(term) || p.description.toLowerCase().includes(term));
      return ok(`${warn}Sorting... Done\nFull Text Search... Done\n${hits.map((p) => `${p.name}/noble ${p.version} amd64${inst.has(p.name) ? " [installed]" : ""}\n  ${p.description}\n`).join("\n")}`);
    }
    case "show": {
      const p = PACKAGES.find((x) => x.name === names[0]);
      if (!p) return fail(`N: Unable to locate package ${names[0] ?? ""}\nE: No packages found`, 100);
      return ok(`${warn}Package: ${p.name}\nVersion: ${p.version}\nPriority: optional\nSection: ${p.section}\nOrigin: Ubuntu\nMaintainer: Ubuntu Developers <ubuntu-devel-discuss@lists.ubuntu.com>\nInstalled-Size: ${kb(p.installedKb)}\n${p.depends ? `Depends: ${p.depends.join(", ")}\n` : ""}Download-Size: ${kb(p.sizeKb)}\nAPT-Sources: http://archive.ubuntu.com/ubuntu noble/main amd64 Packages\nDescription: ${p.description}\n\n`);
    }
    case "install":
    case "reinstall": {
      if (!names.length) return ok(`${warn}${reading}0 upgraded, 0 newly installed, 0 to remove and ${(await upgradable(m, inst)).length} not upgraded.\n`);
      if (!root) return fail(NOT_ROOT("install"), 100);
      let out = warn + reading;
      const ready = await listsReady(m);
      const wanted: Pkg[] = [];
      for (const n of names) {
        const p = PACKAGES.find((x) => x.name === n) ?? (ready ? PACKAGES.find((x) => x.bins.includes(n) && x.name !== n && false) : undefined);
        if (!p || !ready) return { stdout: out, stderr: `E: Unable to locate package ${n}\n`, exitCode: 100 };
        if (inst.has(p.name) && verb === "install") {
          out += `${p.name} is already the newest version (${inst.get(p.name)}).\n`;
          continue;
        }
        for (const d of p.depends ?? []) {
          const dp = PACKAGES.find((x) => x.name === d);
          if (dp && !inst.has(d) && !wanted.includes(dp)) wanted.push(dp);
        }
        if (!wanted.includes(p)) wanted.push(p);
      }
      const notUp = (await upgradable(m, inst)).length;
      if (!wanted.length) return ok(`${out}0 upgraded, 0 newly installed, 0 to remove and ${notUp} not upgraded.\n`);
      const extra = wanted.filter((p) => !names.includes(p.name));
      if (extra.length) out += `The following additional packages will be installed:\n  ${extra.map((p) => p.name).join(" ")}\n`;
      out += `The following NEW packages will be installed:\n  ${wanted.map((p) => p.name).join(" ")}\n0 upgraded, ${wanted.length} newly installed, 0 to remove and ${notUp} not upgraded.\nNeed to get ${kb(wanted.reduce((s, p) => s + p.sizeKb, 0))} of archives.\nAfter this operation, ${kb(wanted.reduce((s, p) => s + p.installedKb, 0))} of additional disk space will be used.\n`;
      if (extra.length && !yes) {
        const a = (await m.ask(`${out}Do you want to continue? [Y/n] `, { fallback: "y" })).trim();
        out = "";
        if (a && !/^y/i.test(a)) return { stdout: "Abort.\n", stderr: "", exitCode: 1 };
      }
      wanted.forEach((p, i) => (out += `Get:${i + 1} http://archive.ubuntu.com/ubuntu noble/main amd64 ${p.name} amd64 ${p.version} [${kb(p.sizeKb)}]\n`));
      out += `Fetched ${kb(wanted.reduce((s, p) => s + p.sizeKb, 0))} in 0s (1,523 kB/s)\n`;
      for (const p of wanted) out += `Selecting previously unselected package ${p.name}.\n(Reading database ... 74512 files and directories currently installed.)\nPreparing to unpack .../${p.name}_${p.version.replace(/^\d+:/, "")}_amd64.deb ...\nUnpacking ${p.name} (${p.version}) ...\n`;
      for (const p of wanted) {
        out += `Setting up ${p.name} (${p.version}) ...\n`;
        inst.set(p.name, p.version);
      }
      await writeInstalled(m, inst);
      for (const p of wanted) await afterInstall(m, p);
      out += "Processing triggers for man-db (2.12.0-4build2) ...\n";
      return ok(out);
    }
    case "remove":
    case "purge": {
      if (!root) return fail(NOT_ROOT("remove"), 100);
      let out = warn + reading;
      const gone: Pkg[] = [];
      for (const n of names) {
        const p = PACKAGES.find((x) => x.name === n);
        if (!p) return { stdout: out, stderr: `E: Unable to locate package ${n}\n`, exitCode: 100 };
        if (!inst.has(n)) out += `Package '${n}' is not installed, so not removed\n`;
        else gone.push(p);
      }
      const notUp = (await upgradable(m, inst)).length;
      if (!gone.length) return ok(`${out}0 upgraded, 0 newly installed, 0 to remove and ${notUp} not upgraded.\n`);
      out += `The following packages will be REMOVED:\n  ${gone.map((p) => `${p.name}${verb === "purge" ? "*" : ""}`).join(" ")}\n0 upgraded, 0 newly installed, ${gone.length} to remove and ${notUp} not upgraded.\nAfter this operation, ${kb(gone.reduce((s, p) => s + p.installedKb, 0))} disk space will be freed.\n`;
      if (!yes) {
        const a = (await m.ask(`${out}Do you want to continue? [Y/n] `, { fallback: "y" })).trim();
        out = "";
        if (a && !/^y/i.test(a)) return { stdout: "Abort.\n", stderr: "", exitCode: 1 };
      }
      out += "(Reading database ... 74530 files and directories currently installed.)\n";
      for (const p of gone) {
        out += `Removing ${p.name} (${p.version}) ...\n`;
        inst.delete(p.name);
        await afterRemove(m, p);
      }
      await writeInstalled(m, inst);
      out += "Processing triggers for man-db (2.12.0-4build2) ...\n";
      return ok(out);
    }
    case "upgrade":
    case "full-upgrade":
    case "dist-upgrade": {
      if (!root) return fail(NOT_ROOT("upgrade"), 100);
      const ups = await upgradable(m, inst);
      let out = `${warn}${reading}Calculating upgrade... Done\n`;
      if (!ups.length) return ok(`${out}0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.\n`);
      out += `The following packages will be upgraded:\n  ${ups.map((p) => p.name).join(" ")}\n${ups.length} upgraded, 0 newly installed, 0 to remove and 0 not upgraded.\nNeed to get ${kb(ups.reduce((s, p) => s + p.sizeKb, 0))} of archives.\nAfter this operation, 12.3 kB of additional disk space will be used.\n`;
      if (!yes) {
        const a = (await m.ask(`${out}Do you want to continue? [Y/n] `, { fallback: "y" })).trim();
        out = "";
        if (a && !/^y/i.test(a)) return { stdout: "Abort.\n", stderr: "", exitCode: 1 };
      }
      for (const p of ups) {
        out += `Preparing to unpack .../${p.name}_${p.newer!.replace(/^\d+:/, "")}_amd64.deb ...\nUnpacking ${p.name} (${p.newer}) over (${inst.get(p.name)}) ...\n`;
        inst.set(p.name, p.newer!);
      }
      for (const p of ups) out += `Setting up ${p.name} (${p.newer}) ...\n`;
      await writeInstalled(m, inst);
      return ok(out);
    }
    case "autoremove":
      if (!root) return fail(NOT_ROOT("autoremove"), 100);
      return ok(`${warn}${reading}0 upgraded, 0 newly installed, 0 to remove and ${(await upgradable(m, inst)).length} not upgraded.\n`);
    default:
      return fail(`E: Invalid operation ${verb}`, 100);
  }
}

export function aptCommands(m: Machine): Command[] {
  return [
    { name: "apt", execute: (args, ctx) => apt(m, args, ctx.env.get("MP_TTY") === "1") },
    { name: "apt-get", execute: (args, ctx) => apt(m, args, ctx.env.get("MP_TTY") === "1", true) },
    {
      name: "dpkg",
      async execute(args) {
        const inst = await readInstalled(m);
        if (args[0] === "-l" || args[0] === "--list") {
          const rows = [...inst].filter(([n]) => !args[1] || new RegExp(`^${args[1].replace(/\*/g, ".*")}$`).test(n)).sort();
          if (!rows.length) return fail(`dpkg-query: no packages found matching ${args[1]}`);
          return ok(
            `Desired=Unknown/Install/Remove/Purge/Hold\n| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend\n|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)\n||/ Name           Version                      Architecture Description\n+++-==============-============================-============-=================================\n${rows.map(([n, v]) => `ii  ${n.padEnd(14)} ${v.padEnd(28)} amd64        ${PACKAGES.find((p) => p.name === n)?.description ?? ""}`).join("\n")}\n`,
          );
        }
        if (args[0] === "-L" && args[1]) {
          const p = PACKAGES.find((x) => x.name === args[1]);
          if (!p || !inst.has(p.name)) return fail(`dpkg-query: package '${args[1]}' is not installed\nUse dpkg --contents (= dpkg-deb --contents) to list archive files contents.`);
          return ok(`${p.bins.map((b) => `/usr/bin/${b}`).join("\n")}\n/usr/share/doc/${p.name}/copyright\n`);
        }
        return fail("dpkg: the practice terminal's dpkg knows -l (list packages) and -L <package> (its files). Install packages with apt.", 2);
      },
    },
    {
      name: "dnf",
      execute: async () => fail("Command 'dnf' not found, but can be installed with:\nsudo apt install dnf\n(dnf is the package manager of Fedora and Red Hat. Ubuntu uses apt.)", 127),
    },
    {
      name: "cowsay",
      async execute(args) {
        const missing = await needPackage(m, "cowsay");
        if (missing) return missing;
        const text = args.join(" ") || "Moo";
        const line = "_".repeat(text.length + 2);
        return ok(` ${line}\n< ${text} >\n ${"-".repeat(text.length + 2)}\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||\n`);
      },
    },
  ];
}
