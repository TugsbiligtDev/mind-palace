// The network, from the command line (Modules 25, 30 and 32): curl and wget fetch pages from
// the pretend internet and from the practice servers (whose nginx and shop app really serve
// their files); ping, dig, host, nslookup and nc test names and ports; ss, ip and the old
// ifconfig/netstat show this computer's side; ufw is the firewall. And SSH to the practice
// servers: ssh (one command, or a whole session), scp, rsync and ssh-copy-id, with
// ~/.ssh/config, host keys in known_hosts, keys or passwords, and the permission checks real
// SSH makes. `ssh git@github.com` is handled in github.ts.
import type { Command, ResolvedCommandContext } from "just-bash";
import type { Machine } from "../machine";
import { HOME, HOST, SERVER_PASSWORD, USER, basename, dirname, fail, join, ok, parseArgs, pwHash } from "../util";
import { LOCAL_IP, type Resolved, SIM_HOSTS, resolveName } from "../world";
import { needPackage } from "./apt";
import { githubSsh } from "./github";
import { readDb } from "./misc";

const cmd = (name: string, execute: Command["execute"]): Command => ({ name, execute });
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const tty = (ctx: ResolvedCommandContext) => ctx.env.get("MP_TTY") === "1";

async function readAsRoot(m: Machine, path: string): Promise<string | undefined> {
  return m.asRoot(async () => {
    try {
      return await m.fs.readFile(path);
    } catch {
      return undefined;
    }
  });
}

async function resolve(m: Machine, name: string): Promise<Resolved | undefined> {
  return resolveName(name, (await readAsRoot(m, "/etc/hosts")) ?? "");
}

/** The computer behind an address, if it's one the practice terminal simulates. */
async function machineFor(m: Machine, r: Resolved): Promise<Machine | undefined> {
  if (r.local) return m;
  if (r.sim) return r.sim.name === m.host ? m : m.server(r.sim.name);
  return undefined;
}

// ----- the firewall (ufw) -----

type UfwRule = { port: string; proto?: string; action: "allow" | "deny" };
type Ufw = { enabled: boolean; rules: UfwRule[]; incoming: "deny" | "allow" };
const UFW = "/etc/ufw/mp-state.json";

async function readUfw(m: Machine): Promise<Ufw> {
  const t = await readAsRoot(m, UFW);
  return t ? (JSON.parse(t) as Ufw) : { enabled: false, rules: [], incoming: "deny" };
}

const APP_PORTS: Record<string, string[]> = { ssh: ["22/tcp"], openssh: ["22/tcp"], http: ["80/tcp"], https: ["443/tcp"], "nginx http": ["80/tcp"], "nginx https": ["443/tcp"], "nginx full": ["80/tcp", "443/tcp"] };

/** Whether the firewall on `target` lets a connection from elsewhere reach `port`. */
async function firewallAllows(target: Machine, port: number, fromSelf: boolean): Promise<boolean> {
  if (fromSelf) return true;
  const f = await readUfw(target);
  if (!f.enabled) return true;
  let verdict = f.incoming === "allow";
  for (const r of f.rules) {
    const ports = APP_PORTS[r.port.toLowerCase()] ?? [r.port];
    if (ports.some((p) => p.split("/")[0] === String(port))) verdict = r.action === "allow";
  }
  return verdict;
}

async function ufw(m: Machine, args: string[]) {
  if (!m.perms.root) return fail("ERROR: You need to be root to run this script");
  const f = await readUfw(m);
  const save = () =>
    m.asRoot(async () => {
      await m.fs.mkdir("/etc/ufw", { recursive: true });
      await m.fs.writeFile(UFW, JSON.stringify(f));
    });
  const [verb, ...rest] = args;
  const ruleText = (r: UfwRule) => (APP_PORTS[r.port.toLowerCase()] ? r.port.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/^Openssh$/, "OpenSSH") : `${r.port}${r.proto ? `/${r.proto}` : ""}`);
  switch (verb) {
    case "status": {
      if (!f.enabled) return ok("Status: inactive\n");
      const verbose = rest.includes("verbose");
      const numbered = rest.includes("numbered");
      let out = `Status: active\n${verbose ? `Logging: on (low)\nDefault: ${f.incoming} (incoming), allow (outgoing), disabled (routed)\nNew profiles: skip\n` : ""}\n`;
      const rows = [...f.rules.map((r) => [ruleText(r), r.action.toUpperCase(), "Anywhere"]), ...f.rules.map((r) => [`${ruleText(r)} (v6)`, r.action.toUpperCase(), "Anywhere (v6)"])];
      out += `${numbered ? "     " : ""}To                         Action      From\n${numbered ? "     " : ""}--                         ------      ----\n`;
      rows.forEach((r, i) => (out += `${numbered ? `[${String(i + 1).padStart(2)}] ` : ""}${r[0].padEnd(27)}${(r[1] + (verbose ? " IN" : "")).padEnd(12)}${r[2]}\n`));
      return ok(`${out}\n`);
    }
    case "enable": {
      const a = (await m.ask("Command may disrupt existing ssh connections. Proceed with operation (y|n)? ", { fallback: "y" })).trim();
      if (!/^y/i.test(a)) return ok("Aborted\n");
      f.enabled = true;
      await save();
      return ok("Firewall is active and enabled on system startup\n");
    }
    case "disable":
      f.enabled = false;
      await save();
      return ok("Firewall stopped and disabled on system startup\n");
    case "reset":
      f.enabled = false;
      f.rules = [];
      await save();
      return ok("Resetting all rules to installed defaults. Proceeding with operation (y|n)? y\nBacking up 'user.rules' to '/etc/ufw/user.rules.20261006_090001'\n");
    case "default": {
      const [action, dir] = rest;
      if (dir === "incoming" && (action === "deny" || action === "allow")) f.incoming = action;
      await save();
      return ok(`Default incoming policy changed to '${f.incoming}'\n(be sure to update your rules accordingly)\n`);
    }
    case "allow":
    case "deny":
    case "delete": {
      let action: "allow" | "deny" = verb === "deny" ? "deny" : "allow";
      let spec = rest.join(" ");
      if (verb === "delete") {
        action = rest[0] === "deny" ? "deny" : "allow";
        spec = rest.slice(1).join(" ");
      }
      if (!spec) return fail("ERROR: Invalid syntax");
      const [port, proto] = spec.replace(/^"|"$/g, "").split("/");
      const i = f.rules.findIndex((r) => r.port.toLowerCase() === port.toLowerCase() && r.proto === proto);
      if (verb === "delete") {
        if (i < 0 || f.rules[i].action !== action) return ok("Could not delete non-existent rule\nCould not delete non-existent rule (v6)\n");
        f.rules.splice(i, 1);
        await save();
        return ok("Rule deleted\nRule deleted (v6)\n");
      }
      if (!APP_PORTS[port.toLowerCase()] && !/^\d+(:\d+)?$/.test(port)) return fail(`ERROR: Could not find a profile matching '${port}'`);
      if (i >= 0 && f.rules[i].action === action) return ok("Skipping adding existing rule\nSkipping adding existing rule (v6)\n");
      if (i >= 0) f.rules[i].action = action;
      else f.rules.push({ port, proto, action });
      await save();
      return ok(i >= 0 ? "Rule updated\nRule updated (v6)\n" : "Rule added\nRule added (v6)\n");
    }
    case "app":
      return ok("Available applications:\n  Nginx Full\n  Nginx HTTP\n  Nginx HTTPS\n  OpenSSH\n");
    default:
      return fail(`ERROR: Invalid syntax\n\nUsage: ufw COMMAND\n\nCommands:\n enable                          enables the firewall\n disable                         disables the firewall\n default ARG                     set default policy\n allow ARGS                      add allow rule\n deny ARGS                       add deny rule\n delete RULE|NUM                 delete RULE\n status                          show firewall status\n status numbered                 show firewall status as numbered list of RULES\n status verbose                  show verbose firewall status\n`);
  }
}

// ----- HTTP -----

type Response = { status: number; headers: [string, string][]; body: string };
type HttpError = { code: number; msg: string; timeout?: boolean };

const REASONS: Record<number, string> = { 200: "OK", 201: "Created", 204: "No Content", 301: "Moved Permanently", 302: "Found", 304: "Not Modified", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Not Allowed", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable" };

const TYPES: Record<string, string> = { html: "text/html", htm: "text/html", css: "text/css", js: "application/javascript", json: "application/json", txt: "text/plain", md: "text/markdown", csv: "text/csv", gz: "application/gzip", tgz: "application/gzip", zip: "application/zip", png: "image/png", jpg: "image/jpeg", sh: "application/x-sh", log: "text/plain" };

const nginxPage = (status: number) =>
  `<html>\r\n<head><title>${status} ${REASONS[status]}</title></head>\r\n<body>\r\n<center><h1>${status} ${REASONS[status]}</h1></center>\r\n<hr><center>nginx/1.24.0 (Ubuntu)</center>\r\n</body>\r\n</html>\r\n`;

type Url = { scheme: string; host: string; port: number; path: string; query: string };

function parseUrl(raw: string): Url | undefined {
  const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`;
  const m = /^([a-z]+):\/\/([^/:?#]+)(?::(\d+))?([^?#]*)(\?[^#]*)?/i.exec(withScheme);
  if (!m) return undefined;
  const scheme = m[1].toLowerCase();
  return { scheme, host: m[2].toLowerCase(), port: m[3] ? Number(m[3]) : scheme === "https" ? 443 : 80, path: m[4] || "/", query: m[5] ?? "" };
}

async function fileResponse(m: Machine, root: string, path: string, binary = false): Promise<Response> {
  let p = join(root, `.${decodeURIComponent(path)}`);
  if (!p.startsWith(root)) return { status: 403, headers: [["content-type", "text/html"]], body: nginxPage(403) };
  const isDir = await m.asRoot(() => m.perms.isDir(p));
  if (isDir) {
    for (const idx of ["index.html", "index.htm", "index.nginx-debian.html"]) {
      if (await m.asRoot(() => m.perms.exists(`${p}/${idx}`))) {
        p = `${p}/${idx}`;
        break;
      }
    }
  }
  const text = await m.asRoot(async () => {
    try {
      if (!(await m.perms.exists(p)) || (await m.perms.isDir(p))) return undefined;
      // nginx runs as www-data: a file it may not read is "403 Forbidden".
      if (!(await m.perms.userCan(p, "www-data", "r"))) return null;
      return binary ? new TextDecoder("latin1").decode(await m.fs.readFileBuffer(p)) : await m.fs.readFile(p);
    } catch {
      return undefined;
    }
  });
  if (text === null) return { status: 403, headers: [["content-type", "text/html"]], body: nginxPage(403) };
  if (text === undefined) return { status: 404, headers: [["content-type", "text/html"]], body: nginxPage(404) };
  const ext = p.split(".").pop() ?? "";
  return { status: 200, headers: [["content-type", TYPES[ext] ?? "application/octet-stream"]], body: text };
}

/** Asks `target` for a page on `port`: whatever program listens there answers. */
async function askMachine(target: Machine, u: Url, method: string): Promise<Response | HttpError> {
  const listeners = await target.services.listening();
  const l = listeners.find((x) => x.port === u.port && x.proto === "tcp");
  if (!l) return { code: 7, msg: `Failed to connect to ${u.host} port ${u.port} after 0 ms: Couldn't connect to server` };
  const proc = l.proc;
  const server = (r: Response): Response => ({ ...r, headers: [["server", "nginx/1.24.0 (Ubuntu)"], ...r.headers] });
  if (proc.comm === "nginx") {
    const conf = await target.services.nginxConfig();
    if ("error" in conf) return { code: 52, msg: "Empty reply from server" };
    const site = conf.sites.find((s) => s.port === u.port) ?? conf.sites[0];
    if (site?.ret) return server({ status: site.ret.code, headers: [["content-type", "text/html"], ["location", site.ret.url.replace("$host", u.host).replace("$request_uri", u.path + u.query)]], body: nginxPage(site.ret.code) });
    if (method !== "GET" && method !== "HEAD") return server({ status: 405, headers: [["content-type", "text/html"]], body: nginxPage(405) });
    return server(await fileResponse(target, site?.root ?? "/var/www/html", u.path, true));
  }
  if (proc.comm === "node") {
    const json = (status: number, v: unknown): Response => ({ status, headers: [["content-type", "application/json; charset=utf-8"], ["x-powered-by", "Express"]], body: `${JSON.stringify(v)}\n` });
    if (u.path === "/health") return json(200, { status: "ok" });
    if (u.path === "/" || u.path === "") return json(200, { name: "Inkwell shop API", version: "2.3.1" });
    if (u.path === "/books") return json(200, [{ id: 1, title: "Dune", price: 9.99, stock: 2 }, { id: 2, title: "The Hobbit", price: 8.5, stock: 7 }, { id: 3, title: "Circe", price: 12, stock: 4 }]);
    return json(404, { error: "not found" });
  }
  if (proc.comm === "sshd") return { code: 1, msg: "Received HTTP/0.9 when not allowed" };
  return { code: 52, msg: "Empty reply from server" };
}

/** The pretend internet: a few well-known sites, plus anything a lesson put in /srv/internet. */
async function askInternet(m: Machine, u: Url): Promise<Response> {
  const html = (body: string): Response => ({ status: 200, headers: [["content-type", "text/html; charset=UTF-8"]], body });
  const override = `/srv/internet/${u.host}`;
  if (await m.root.asRoot(() => m.root.perms.isDir(override))) {
    const r = await fileResponse(m.root, override, u.path, true);
    return r;
  }
  if (u.host.endsWith(".github.io")) return { status: 404, headers: [["content-type", "text/html; charset=utf-8"]], body: "<!DOCTYPE html>\n<title>Site not found · GitHub Pages</title>\n<h1>404</h1>\n<p><strong>There isn't a GitHub Pages site here.</strong></p>\n" };
  if (u.scheme === "http" && u.host !== "example.com") return { status: 301, headers: [["content-type", "text/html"], ["location", `https://${u.host}${u.path}${u.query}`]], body: "" };
  if (u.host === "example.com" || u.host === "www.example.com") {
    if (u.path !== "/" && u.path !== "/index.html") return { status: 404, headers: [["content-type", "text/html; charset=UTF-8"]], body: "<!doctype html>\n<html><body><h1>404 Not Found</h1></body></html>\n" };
    return html(`<!doctype html>\n<html>\n<head>\n    <title>Example Domain</title>\n</head>\n<body>\n<div>\n    <h1>Example Domain</h1>\n    <p>This domain is for use in documentation examples without needing permission.</p>\n    <p><a href="https://iana.org/domains/example">Learn more</a></p>\n</div>\n</body>\n</html>\n`);
  }
  if (u.host === "raw.githubusercontent.com") {
    const [, owner, repo, branch, ...rest] = u.path.split("/");
    const { Repo } = await import("../git/repo");
    const bare = await m.root.asRoot(() => Repo.open(m.root.fs, `/srv/git/github.com/${owner}/${repo}.git`, m.now));
    const sha = bare ? await m.root.asRoot(() => bare.resolve(`refs/heads/${branch}`)) : undefined;
    const f = sha ? (await m.root.asRoot(() => bare!.commitFiles(sha))).get(rest.join("/")) : undefined;
    if (!f) return { status: 404, headers: [["content-type", "text/plain; charset=utf-8"]], body: "404: Not Found" };
    return { status: 200, headers: [["content-type", "text/plain; charset=utf-8"]], body: await m.root.asRoot(() => bare!.readBlobText(f.sha)) };
  }
  if (u.host === "api.github.com") {
    const json = (status: number, v: unknown): Response => ({ status, headers: [["content-type", "application/json; charset=utf-8"]], body: `${JSON.stringify(v, null, 2)}\n` });
    const rm = /^\/repos\/([^/]+)\/([^/]+)\/?$/.exec(u.path);
    if (rm) {
      const exists = await m.root.asRoot(() => m.root.perms.exists(`/srv/git/github.com/${rm[1]}/${rm[2]}.git`));
      if (!exists) return json(404, { message: "Not Found", documentation_url: "https://docs.github.com/rest/repos/repos#get-a-repository", status: "404" });
      return json(200, { id: 873015220, name: rm[2], full_name: `${rm[1]}/${rm[2]}`, private: false, owner: { login: rm[1], type: "Organization" }, html_url: `https://github.com/${rm[1]}/${rm[2]}`, default_branch: "main", stargazers_count: 12, forks_count: 3, open_issues_count: 2, language: "HTML", license: { key: "mit", name: "MIT License" } });
    }
    const um = /^\/users\/([^/]+)\/?$/.exec(u.path);
    if (um) return json(200, { login: um[1], id: 90210, type: "User", public_repos: 4, html_url: `https://github.com/${um[1]}` });
    return json(200, { current_user_url: "https://api.github.com/user", repository_url: "https://api.github.com/repos/{owner}/{repo}", user_url: "https://api.github.com/users/{user}" });
  }
  if (u.host === "github.com") return html("<!DOCTYPE html>\n<html lang=\"en\">\n<head><title>GitHub · Build and ship software on a single, collaborative platform · GitHub</title></head>\n<body>…</body>\n</html>\n");
  return html(`<!DOCTYPE html>\n<html><head><title>${u.host}</title></head><body><h1>${u.host}</h1></body></html>\n`);
}

async function fetchUrl(m: Machine, raw: string, method: string): Promise<{ url: Url; ip: string } & ({ res: Response } | { err: HttpError })> {
  const u = parseUrl(raw);
  if (!u) return { url: { scheme: "http", host: raw, port: 80, path: "/", query: "" }, ip: "", err: { code: 3, msg: `URL rejected: Malformed input to a URL function` } };
  const r = await resolve(m, u.host);
  if (!r) return { url: u, ip: "", err: { code: 6, msg: `Could not resolve host: ${u.host}` } };
  const base = { url: u, ip: r.ip };
  const target = await machineFor(m, r);
  if (target) {
    if (!(await firewallAllows(target, u.port, target === m))) return { ...base, err: { code: 28, msg: `Failed to connect to ${u.host} port ${u.port} after 10002 ms: Timeout was reached`, timeout: true } };
    const res = await askMachine(target, u, method);
    return "code" in res ? { ...base, err: res } : { ...base, res };
  }
  if (r.net?.down) return { ...base, err: { code: 28, msg: `Failed to connect to ${u.host} port ${u.port} after 10002 ms: Timeout was reached`, timeout: true } };
  if (u.port !== 80 && u.port !== 443) return { ...base, err: { code: 28, msg: `Failed to connect to ${u.host} port ${u.port} after 10002 ms: Timeout was reached`, timeout: true } };
  return { ...base, res: await askInternet(m, u) };
}

function headerBlock(u: Url, res: Response): string {
  const h2 = u.scheme === "https";
  const len = new TextEncoder().encode(res.body).length;
  const all: [string, string][] = [...res.headers, ["content-length", String(len)]];
  if (h2) return `HTTP/2 ${res.status} \r\n${all.map(([k, v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`;
  const cap = (k: string) => k.replace(/(^|-)([a-z])/g, (_, d: string, c: string) => d + c.toUpperCase());
  return `HTTP/1.1 ${res.status} ${REASONS[res.status] ?? ""}\r\n${all.map(([k, v]) => `${cap(k)}: ${v}`).join("\r\n")}\r\nConnection: keep-alive\r\n\r\n`;
}

const PROGRESS_HEAD = "  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current\n                                 Dload  Upload   Total   Spent    Left  Speed\n";
const progress = (n: number) => `${PROGRESS_HEAD}${`100  ${String(n).padStart(5)}  100  ${String(n).padStart(5)}    0     0  ${String(n * 20).padStart(5)}      0 --:--:-- --:--:-- --:--:-- ${String(n * 20).padStart(5)}`}\n`;

async function curl(m: Machine, args: string[], ctx: ResolvedCommandContext) {
  let silent = false;
  let showErr = false;
  let headOnly = false;
  let include = false;
  let verbose = false;
  let follow = false;
  let failHttp = false;
  let method: string | undefined;
  let data: string | undefined;
  let out: string | undefined;
  let remoteName = false;
  let write: string | undefined;
  const urls: string[] = [];
  const extraHeaders: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      const val = () => v ?? args[++i];
      if (k === "silent") silent = true;
      else if (k === "show-error") showErr = true;
      else if (k === "head") headOnly = true;
      else if (k === "include") include = true;
      else if (k === "verbose") verbose = true;
      else if (k === "location") follow = true;
      else if (k === "fail") failHttp = true;
      else if (k === "request") method = val();
      else if (k === "data" || k === "data-raw") data = val();
      else if (k === "output") out = val();
      else if (k === "remote-name") remoteName = true;
      else if (k === "write-out") write = val();
      else if (k === "header") extraHeaders.push(val());
      else if (k === "user-agent" || k === "max-time" || k === "connect-timeout") val();
      else if (k === "insecure" || k === "compressed") continue;
      else if (k === "help") return ok("Usage: curl [options...] <url>\n -d, --data <data>           HTTP POST data\n -f, --fail                  Fail fast with no output on HTTP errors\n -H, --header <header/@file> Pass custom header(s) to server\n -i, --include               Include response headers in output\n -I, --head                  Show document info only\n -L, --location              Follow redirects\n -o, --output <file>         Write to file instead of stdout\n -O, --remote-name           Write output to a file named as the remote file\n -s, --silent                Silent mode\n -S, --show-error            Show error even when -s is used\n -v, --verbose               Make the operation more talkative\n -w, --write-out <format>    Use output FORMAT after completion\n -X, --request <method>      Specify request method to use\n\nThis is not the full help; this menu is split into categories.\n");
      else return fail(`curl: option --${k}: is unknown\ncurl: try 'curl --help' or 'curl --manual' for more information`, 2);
      continue;
    }
    if (a.startsWith("-") && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        const c = a[j];
        const takes = "XdoHwAmu".includes(c);
        if (takes) {
          const v = a.slice(j + 1) || args[++i];
          if (c === "X") method = v;
          else if (c === "d") data = v;
          else if (c === "o") out = v;
          else if (c === "H") extraHeaders.push(v);
          else if (c === "w") write = v;
          break;
        }
        if (c === "s") silent = true;
        else if (c === "S") showErr = true;
        else if (c === "I") headOnly = true;
        else if (c === "i") include = true;
        else if (c === "v") verbose = true;
        else if (c === "L") follow = true;
        else if (c === "f") failHttp = true;
        else if (c === "O") remoteName = true;
        else if (c === "k") continue;
        else return fail(`curl: option -${c}: is unknown\ncurl: try 'curl --help' or 'curl --manual' for more information`, 2);
      }
      continue;
    }
    urls.push(a);
  }
  if (!urls.length) return fail("curl: no URL specified\ncurl: try 'curl --help' or 'curl --manual' for more information", 2);
  const m2 = method ?? (headOnly ? "HEAD" : data !== undefined ? "POST" : "GET");
  let stdout = "";
  let stderr = "";
  let code = 0;
  for (const raw of urls) {
    let target = raw;
    let hops = 0;
    for (;;) {
      const r = await fetchUrl(m, target, m2);
      if (verbose) {
        stderr += `* Host ${r.url.host}:${r.url.port} was resolved.\n* IPv6: (none)\n* IPv4: ${r.ip}\n*   Trying ${r.ip}:${r.url.port}...\n`;
      }
      if ("err" in r) {
        if (verbose) stderr += `* connect to ${r.ip} port ${r.url.port} from ${LOCAL_IP} port 48572 failed: ${r.err.timeout ? "Connection timed out" : "Connection refused"}\n`;
        if (!silent || showErr) stderr += `curl: (${r.err.code}) ${r.err.msg}\n`;
        code = r.err.code;
        break;
      }
      const res = r.res;
      const head = headerBlock(r.url, res);
      if (verbose) {
        stderr += `* Connected to ${r.url.host} (${r.ip}) port ${r.url.port}\n${r.url.scheme === "https" ? "* using HTTP/2\n* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384 / X25519 / id-ecPublicKey\n" : ""}`;
        stderr += `> ${m2} ${r.url.path}${r.url.query} ${r.url.scheme === "https" ? "HTTP/2" : "HTTP/1.1"}\n> Host: ${r.url.host}${(r.url.scheme === "https" && r.url.port !== 443) || (r.url.scheme === "http" && r.url.port !== 80) ? `:${r.url.port}` : ""}\n> User-Agent: curl/8.5.0\n> Accept: */*\n${extraHeaders.map((h) => `> ${h}\n`).join("")}> \n`;
        stderr += head.replace(/\r\n$/, "").split("\r\n").map((l) => `< ${l}`).join("\n") + "\n";
      }
      if (failHttp && res.status >= 400) {
        if (!silent || showErr) stderr += `curl: (22) The requested URL returned error: ${res.status}\n`;
        code = 22;
        break;
      }
      const loc = res.headers.find(([k]) => k === "location")?.[1];
      if (follow && loc && res.status >= 300 && res.status < 400 && hops < 10) {
        if (headOnly || include) stdout += head;
        target = loc;
        hops++;
        continue;
      }
      let body = m2 === "HEAD" ? "" : res.body;
      if (headOnly) body = "";
      const shown = (headOnly || include ? head : "") + body;
      const fileName = out ?? (remoteName ? basename(r.url.path) || "index.html" : undefined);
      if (fileName) {
        if (remoteName && !basename(r.url.path)) return fail("curl: Remote file name has no length\ncurl: (23) Failed writing received data to disk/application", 23);
        const p = join(ctx.cwd, fileName);
        try {
          if (p === "/dev/null") {
            /* thrown away */
          } else {
            const bytes = Uint8Array.from(shown, (c) => c.charCodeAt(0) & 0xff);
            await ctx.fs.writeFile(p, /[^\x00-\x7f]/.test(shown) && !/[\x80-\xff]/.test(shown) ? shown : (bytes as unknown as string));
          }
        } catch {
          return fail(`curl: (23) Failure writing output to destination`, 23);
        }
        if (!silent) stderr += progress(shown.length);
      } else {
        stdout += shown;
        if (!silent && !tty(ctx) && !verbose) stderr += progress(shown.length);
      }
      if (write) stdout += write.replace(/%\{http_code\}|%\{response_code\}/g, String(res.status)).replace(/%\{url_effective\}/g, `${r.url.scheme}://${r.url.host}${r.url.path}`).replace(/%\{size_download\}/g, String(body.length)).replace(/\\n/g, "\n");
      if (verbose) stderr += `* Connection #0 to host ${r.url.host} left intact\n`;
      break;
    }
  }
  // On screen, curl -v's notes come before the page they describe (they're written first).
  if (verbose && tty(ctx)) return { stdout: stderr + stdout, stderr: "", exitCode: code };
  return { stdout, stderr, exitCode: code };
}

async function wget(m: Machine, args: string[], ctx: ResolvedCommandContext) {
  const { flags, values, operands } = parseArgs(args, "O");
  const raw = operands[0];
  if (!raw) return fail("wget: missing URL\nUsage: wget [OPTION]... [URL]...\n\nTry `wget --help' for more options.");
  const now = m.now();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getUTCFullYear()}-${p2(now.getUTCMonth() + 1)}-${p2(now.getUTCDate())} ${p2(now.getUTCHours())}:${p2(now.getUTCMinutes())}:${p2(now.getUTCSeconds())}`;
  let target = raw;
  let log = "";
  for (let hops = 0; hops < 10; hops++) {
    const r = await fetchUrl(m, target, "GET");
    log += `--${stamp}--  ${r.url.scheme}://${r.url.host}${r.url.path}${r.url.query}\n`;
    if ("err" in r && r.err.code === 6) return fail(`${flags.has("q") ? "" : log}Resolving ${r.url.host} (${r.url.host})... failed: Name or service not known.\nwget: unable to resolve host address ‘${r.url.host}’`, 4);
    log += `Resolving ${r.url.host} (${r.url.host})... ${r.ip}\nConnecting to ${r.url.host} (${r.url.host})|${r.ip}|:${r.url.port}... `;
    if ("err" in r) return fail(`${flags.has("q") ? "" : log}failed: ${r.err.timeout ? "Connection timed out" : "Connection refused"}.`, 4);
    log += `connected.\nHTTP request sent, awaiting response... ${r.res.status} ${REASONS[r.res.status] ?? ""}\n`;
    const loc = r.res.headers.find(([k]) => k === "location")?.[1];
    if (loc && r.res.status >= 300 && r.res.status < 400) {
      log += `Location: ${loc} [following]\n`;
      target = loc;
      continue;
    }
    if (r.res.status >= 400) return fail(`${flags.has("q") ? "" : log}${stamp} ERROR ${r.res.status}: ${REASONS[r.res.status] ?? ""}.`, 8);
    const name = values.O ?? (basename(r.url.path) || "index.html");
    const len = r.res.body.length;
    const type = r.res.headers.find(([k]) => k === "content-type")?.[1] ?? "text/html";
    const bytes = Uint8Array.from(r.res.body, (c) => c.charCodeAt(0) & 0xff);
    if (name === "-") return ok(r.res.body, flags.has("q") ? "" : log);
    await ctx.fs.writeFile(join(ctx.cwd, name), bytes as unknown as string);
    log += `Length: ${len} (${(len / 1024).toFixed(1)}K) [${type.split(";")[0]}]\nSaving to: ‘${name}’\n\n${name.padEnd(20).slice(0, 20)} 100%[===================>]  ${(len / 1024).toFixed(2)}K  --.-KB/s    in 0s\n\n${stamp} (25.6 MB/s) - ‘${name}’ saved [${len}/${len}]\n\n`;
    return ok("", flags.has("q") ? "" : log);
  }
  return fail(`${log}20 redirections exceeded.`, 8);
}

// ----- ping, dig, host, nslookup, nc -----

function rtt(ip: string, i: number): number {
  const base = ip.startsWith("127.") || ip === LOCAL_IP ? 0.035 : ip.startsWith("203.0.113") ? 11.4 : 18.2;
  return base * (1 + ((i * 37) % 11) / 50);
}

async function ping(m: Machine, args: string[], ctx: ResolvedCommandContext) {
  const { values, operands } = parseArgs(args, "cWiw");
  const name = operands[0];
  if (!name) return fail("ping: usage error: Destination address required", 1);
  const r = await resolve(m, name);
  if (!r) return fail(`ping: ${name}: Temporary failure in name resolution`, 2);
  const count = values.c ? Number(values.c) : 4;
  const shown = r.local ? (name === "localhost" ? "localhost" : name) : name;
  let out = `PING ${shown} (${r.ip}) 56(84) bytes of data.\n`;
  const target = await machineFor(m, r);
  const answers = target ? true : !r.net?.down && r.net?.ping !== false;
  const times: number[] = [];
  if (answers) {
    for (let i = 1; i <= count; i++) {
      const t = rtt(r.ip, i);
      times.push(t);
      out += `64 bytes from ${r.local ? (r.ip === "127.0.0.1" ? "localhost" : `${m.host}`) + ` (${r.ip})` : `${name} (${r.ip})`}: icmp_seq=${i} ttl=${target ? 64 : 56} time=${t < 1 ? t.toFixed(3) : t.toFixed(1)} ms\n`;
    }
  }
  if (!values.c && tty(ctx)) out += `^C\n${dim("(ping keeps going until you press Ctrl+C; the practice terminal stops after 4. Use -c 4 to choose how many.)")}\n`;
  out += `\n--- ${shown} ping statistics ---\n${count} packets transmitted, ${times.length} received, ${times.length ? "0" : "100"}% packet loss, time ${(count - 1) * 1001 + 2}ms\n`;
  if (times.length) {
    const min = Math.min(...times);
    const max = Math.max(...times);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const mdev = Math.sqrt(times.reduce((a, b) => a + (b - avg) ** 2, 0) / times.length);
    out += `rtt min/avg/max/mdev = ${min.toFixed(3)}/${avg.toFixed(3)}/${max.toFixed(3)}/${mdev.toFixed(3)} ms\n`;
  }
  return { stdout: out, stderr: "", exitCode: times.length ? 0 : 1 };
}

/** DNS only: unlike ping and curl, dig doesn't read /etc/hosts. */
function dnsLookup(name: string): { name: string; ip: string; cname?: string } | undefined {
  const r = resolveName(name, "");
  if (!r || r.local || (r.net && !r.net.name.includes(".") && false)) return undefined;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return undefined;
  return { name: name.replace(/\.$/, ""), ip: r.ip, cname: r.net?.cname };
}

async function dig(m: Machine, args: string[]) {
  const short = args.includes("+short");
  const rest = args.filter((a) => !a.startsWith("+") && !a.startsWith("@"));
  const server = args.find((a) => a.startsWith("@"))?.slice(1) ?? "127.0.0.53";
  const name = rest.find((a) => !/^(A|AAAA|MX|NS|TXT|CNAME|SOA)$/i.test(a) && !a.startsWith("-"));
  const type = (rest.find((a) => /^(A|AAAA|MX|NS|TXT|CNAME|SOA)$/i.test(a)) ?? "A").toUpperCase();
  if (!name) return ok(`\n; <<>> DiG 9.18.30-0ubuntu0.24.04.2-Ubuntu <<>>\n;; global options: +cmd\n;; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 1\n`);
  const hit = dnsLookup(name);
  const fq = `${name.replace(/\.$/, "")}.`;
  const answers: string[] = [];
  if (hit && (type === "A" || type === "CNAME")) {
    if (hit.cname) answers.push(`${fq}\t\t3600\tIN\tCNAME\t${hit.cname}.`);
    if (type === "A") answers.push(`${hit.cname ? `${hit.cname}.` : fq}\t\t300\tIN\tA\t${hit.ip}`);
  }
  if (short) return ok(answers.map((a) => a.split("\t").at(-1)).join("\n") + (answers.length ? "\n" : ""));
  const now = m.now();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p2 = (n: number) => String(n).padStart(2, "0");
  const when = `${days[now.getUTCDay()]} ${months[now.getUTCMonth()]} ${p2(now.getUTCDate())} ${p2(now.getUTCHours())}:${p2(now.getUTCMinutes())}:${p2(now.getUTCSeconds())} UTC ${now.getUTCFullYear()}`;
  const status = hit ? "NOERROR" : "NXDOMAIN";
  const domain = name.split(".").slice(-2).join(".");
  let out = `\n; <<>> DiG 9.18.30-0ubuntu0.24.04.2-Ubuntu <<>> ${args.join(" ")}\n;; global options: +cmd\n;; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: ${status}, id: 41187\n;; flags: qr rd ra; QUERY: 1, ANSWER: ${answers.length}, AUTHORITY: ${answers.length ? 0 : 1}, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; QUESTION SECTION:\n;${fq}\t\t\tIN\t${type}\n\n`;
  if (answers.length) out += `;; ANSWER SECTION:\n${answers.join("\n")}\n\n`;
  else out += `;; AUTHORITY SECTION:\n${domain}.\t\t900\tIN\tSOA\tns1.${domain}. hostmaster.${domain}. 2026100601 7200 3600 1209600 300\n\n`;
  out += `;; Query time: 12 msec\n;; SERVER: ${server}#53(${server}) (UDP)\n;; WHEN: ${when}\n;; MSG SIZE  rcvd: ${answers.length ? 65 : 104}\n\n`;
  return ok(out);
}

// ----- ss, netstat, ip, ifconfig -----

const SERVICE_NAMES: Record<number, string> = { 22: "ssh", 53: "domain", 80: "http", 443: "https" };

async function sockets(m: Machine, args: string[], legacy: boolean) {
  const flagStr = args.filter((a) => a.startsWith("-") && !a.startsWith("--")).join("").replace(/-/g, "");
  const numeric = flagStr.includes("n");
  const withProc = flagStr.includes("p");
  const tcp = flagStr.includes("t") || !flagStr.includes("u");
  const udp = flagStr.includes("u");
  const all = await m.services.listening();
  const rows = all.filter((l) => (l.proto === "tcp" && tcp) || (l.proto === "udp" && udp));
  const portText = (p: number) => (numeric ? String(p) : (SERVICE_NAMES[p] ?? String(p)));
  const procText = async (l: (typeof rows)[number]) => {
    if (!withProc) return "";
    if (!m.perms.root && l.proc.user !== USER) return "";
    const same = (await m.procs.list()).filter((p) => p.unit && p.unit === l.proc.unit && p.comm === l.proc.comm);
    const list = (same.length ? same : [l.proc]).map((p, i) => `("${p.comm}",pid=${p.pid},fd=${6 + i})`).join(",");
    return legacy ? `${l.proc.pid}/${l.proc.comm}` : `users:(${list})`;
  };
  if (legacy) {
    let out = `Active Internet connections (only servers)\nProto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name    \n`;
    for (const l of rows) out += `${l.proto.padEnd(6)}${"0".padStart(6)}${"0".padStart(7)} ${`${l.addr.replace("*", "0.0.0.0").replace(/%.*/, "")}:${portText(l.port)}`.padEnd(24)}${"0.0.0.0:*".padEnd(24)}${(l.proto === "tcp" ? "LISTEN" : "").padEnd(12)}${await procText(l)}\n`;
    return ok(out);
  }
  let out = `Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port${withProc ? "Process" : ""}\n`;
  for (const l of rows) {
    const local = `${l.addr}:${portText(l.port)}`;
    out += `${l.proto.padEnd(5)} ${(l.proto === "tcp" ? "LISTEN" : "UNCONN").padEnd(6)} 0      ${l.proto === "tcp" ? "4096" : "0"}`.padEnd(26) + `${local.padStart(19)} ${"0.0.0.0:*".padStart(18)}${(await procText(l)) ? ` ${await procText(l)}` : ""}\n`;
  }
  return ok(out);
}

function ipCommand(m: Machine, args: string[]) {
  const ip = m.host === HOST ? LOCAL_IP : (SIM_HOSTS.find((h) => h.name === m.host)?.ip ?? LOCAL_IP);
  const brief = args.includes("-br") || args.includes("-brief");
  const obj = args.filter((a) => !a.startsWith("-"))[0] ?? "";
  const net = ip.split(".").slice(0, 3).join(".");
  if (/^(a|addr|address)$/.test(obj)) {
    if (brief) return ok(`lo               UNKNOWN        127.0.0.1/8 ::1/128 \neth0             UP             ${ip}/24 \n`);
    return ok(
      `1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000\n    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n    inet 127.0.0.1/8 scope host lo\n       valid_lft forever preferred_lft forever\n    inet6 ::1/128 scope host noprefixroute \n       valid_lft forever preferred_lft forever\n2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000\n    link/ether 52:54:00:12:34:56 brd ff:ff:ff:ff:ff:ff\n    altname enp0s1\n    inet ${ip}/24 metric 100 brd ${net}.255 scope global dynamic eth0\n       valid_lft 86232sec preferred_lft 86232sec\n`,
    );
  }
  if (/^(r|route)$/.test(obj)) return ok(`default via ${net}.2 dev eth0 proto dhcp src ${ip} metric 100 \n${net}.0/24 dev eth0 proto kernel scope link src ${ip} metric 100 \n`);
  if (/^(l|link)$/.test(obj)) return ok(`1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000\n    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP mode DEFAULT group default qlen 1000\n    link/ether 52:54:00:12:34:56 brd ff:ff:ff:ff:ff:ff\n`);
  return fail(`Usage: ip [ OPTIONS ] OBJECT { COMMAND | help }\nwhere  OBJECT := { address | link | route | ... }\n(The practice terminal knows: ip addr, ip -br addr, ip route, ip link.)`, 255);
}

// ----- SSH to the practice servers -----

type SshOpts = { port?: number; identity?: string; user?: string; options: Record<string, string> };

/** The settings ~/.ssh/config gives for a host alias (the first value found wins, like ssh). */
async function sshConfig(m: Machine, alias: string): Promise<Record<string, string> | { error: string }> {
  const path = `${HOME}/.ssh/config`;
  if (!(await m.perms.exists(path))) return {};
  const mode = (await m.perms.mode(path)) ?? 0o600;
  if (mode & 0o022) return { error: `Bad owner or permissions on ${path}` };
  const text = (await m.fs.readFile(path).catch(() => "")) ?? "";
  const out: Record<string, string> = {};
  let active = false;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [k, ...rest] = line.split(/\s+|=/).filter(Boolean);
    const key = k.toLowerCase();
    const value = rest.join(" ");
    if (key === "host") {
      active = rest.some((pat) => new RegExp(`^${pat.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`).test(alias));
      continue;
    }
    if (key === "match") {
      active = false;
      continue;
    }
    if (active && !(key in out)) out[key] = value;
  }
  return out;
}

async function fingerprint(key: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return `SHA256:${btoa(String.fromCharCode(...new Uint8Array(d))).replace(/=+$/, "")}`;
}

type Conn = { target: Machine; user: string; host: string; notes: string };

/** Reaches a practice server and logs in, the way ssh does. Used by ssh, scp, rsync, ssh-copy-id. */
async function connect(m: Machine, dest: string, o: SshOpts, opts: { forCopyId?: boolean } = {}): Promise<Conn | { err: string; code: number }> {
  const at = dest.lastIndexOf("@");
  const alias = at >= 0 ? dest.slice(at + 1) : dest;
  const cfg = await sshConfig(m, alias);
  if ("error" in cfg) return { err: `${cfg.error}\n`, code: 255 };
  const host = cfg.hostname ?? alias;
  const user = (at >= 0 ? dest.slice(0, at) : undefined) ?? o.user ?? cfg.user ?? USER;
  const port = o.port ?? (cfg.port ? Number(cfg.port) : 22);
  const r = await resolve(m, host);
  if (!r) return { err: `ssh: Could not resolve hostname ${host}: Name or service not known\n`, code: 255 };
  const target = await machineFor(m, r);
  if (!target) {
    if (r.net?.down || r.net?.ping === false) return { err: `ssh: connect to host ${host} port ${port}: Connection timed out\n`, code: 255 };
    return { err: `ssh: connect to host ${host} port ${port}: Connection refused\n`, code: 255 };
  }
  if (target === m.root && m === m.root) return { err: `ssh: the practice terminal can't log in to itself. Try one of its servers: ssh ${SIM_HOSTS[0].fqdn}\n`, code: 255 };
  if (!(await firewallAllows(target, port, false))) return { err: `ssh: connect to host ${host} port ${port}: Connection timed out\n`, code: 255 };
  const listening = (await target.services.listening()).some((l) => l.port === port && l.proc.comm === "sshd");
  if (!listening) return { err: `ssh: connect to host ${host} port ${port}: Connection refused\n`, code: 255 };

  let notes = "";
  // The server's host key, checked against ~/.ssh/known_hosts.
  const serverKey = ((await readAsRoot(target, "/etc/ssh/ssh_host_ed25519_key.pub")) ?? "").trim().split(/\s+/).slice(0, 2).join(" ");
  const fp = await fingerprint(serverKey);
  const knownPath = `${HOME}/.ssh/known_hosts`;
  const known = (await m.fs.readFile(knownPath).catch(() => "")) ?? "";
  const lines = known.split("\n");
  const label = port === 22 ? host : `[${host}]:${port}`;
  const idx = lines.findIndex((l) => l.split(/\s+/)[0]?.split(",").includes(label) && l.includes("ssh-ed25519"));
  const strict = (o.options.stricthostkeychecking ?? cfg.stricthostkeychecking ?? "ask").toLowerCase();
  if (idx >= 0) {
    const theirs = lines[idx].split(/\s+/).slice(1, 3).join(" ");
    if (theirs !== serverKey) {
      return {
        err:
          `@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\n@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @\n@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\nIT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!\nSomeone could be eavesdropping on you right now (man-in-the-middle attack)!\nIt is also possible that a host key has just been changed.\n` +
          `The fingerprint for the ED25519 key sent by the remote host is\n${fp}.\nPlease contact your system administrator.\nAdd correct host key in ${knownPath} to get rid of this message.\nOffending ED25519 key in ${knownPath}:${idx + 1}\n  remove with:\n  ssh-keygen -f '${knownPath}' -R '${label}'\nHost key for ${label} has changed and you have requested strict checking.\nHost key verification failed.\n`,
        code: 255,
      };
    }
  } else if (!m.root.probing) {
    if (strict === "yes") return { err: `No ED25519 host key is known for ${label} and you have requested strict checking.\nHost key verification failed.\n`, code: 255 };
    if (strict !== "no" && strict !== "accept-new") {
      const answer = (await m.ask(`The authenticity of host '${label} (${r.ip})' can't be established.\nED25519 key fingerprint is ${fp}.\nThis key is not known by any other names.\nAre you sure you want to continue connecting (yes/no/[fingerprint])? `, { fallback: "yes" })).trim();
      if (answer !== "yes" && answer !== fp) return { err: "Host key verification failed.\n", code: 255 };
    }
    await m.fs.mkdir(`${HOME}/.ssh`, { recursive: true });
    await m.fs.appendFile(knownPath, `${known && !known.endsWith("\n") ? "\n" : ""}${label} ${serverKey}\n`);
    notes += `Warning: Permanently added '${label}' (ED25519) to the list of known hosts.\n`;
  }

  // Who's logging in.
  const users = await readDb(target, "/etc/passwd");
  const account = users.find((u) => u[0] === user);
  const sshd = (await readAsRoot(target, "/etc/ssh/sshd_config")) ?? "";
  const setting = (k: string, d: string) => (new RegExp(`^\\s*${k}\\s+(\\S+)`, "mi").exec(sshd)?.[1] ?? d).toLowerCase();
  const passwordOk = setting("PasswordAuthentication", "yes") === "yes";
  const rootLogin = setting("PermitRootLogin", "prohibit-password");
  const methods = passwordOk && !(user === "root" && rootLogin !== "yes") ? "publickey,password" : "publickey";
  const authLog = (msg: string) => target.services.journal({ ident: "sshd", pid: 4420, unit: "ssh.service", prio: 6, msg });
  const appendAuth = async (msg: string) => {
    await authLog(msg);
    await target.asRoot(() => target.fs.appendFile("/var/log/auth.log", `${msg}\n`));
  };

  // Public keys: the ones named with -i or IdentityFile, or the usual ~/.ssh/id_* files.
  const idFiles = [o.identity, cfg.identityfile].filter(Boolean).map((f) => join(m.cwd, f!.replace(/^~/, HOME)));
  const candidates = idFiles.length ? idFiles : ["id_ed25519", "id_ecdsa", "id_rsa"].map((n) => `${HOME}/.ssh/${n}`);
  const offered: { file: string; key: string }[] = [];
  for (const f of candidates) {
    if (!(await m.perms.exists(f))) {
      if (idFiles.includes(f)) notes += `Warning: Identity file ${f} not accessible: No such file or directory.\n`;
      continue;
    }
    const mode = (await m.perms.mode(f)) ?? 0o600;
    if (mode & 0o077) {
      notes += `@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\n@         WARNING: UNPROTECTED PRIVATE KEY FILE!          @\n@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\nPermissions 0${(mode & 0o777).toString(8)} for '${f}' are too open.\nIt is required that your private key files are NOT accessible by others.\nThis private key will be ignored.\nLoad key "${f}": bad permissions\n`;
      continue;
    }
    const pub = ((await m.fs.readFile(`${f}.pub`).catch(() => "")) ?? "").trim().split(/\s+/).slice(0, 2).join(" ");
    if (pub) offered.push({ file: f, key: pub });
  }
  if (account && !opts.forCopyId) {
    const home = account[5];
    const ak = `${home}/.ssh/authorized_keys`;
    const keys = (await readAsRoot(target, ak)) ?? "";
    const badModes = async () => {
      for (const p of [home, `${home}/.ssh`, ak]) {
        const md = await target.asRoot(() => target.perms.mode(p));
        if (md !== undefined && md & 0o022) return p;
      }
      return undefined;
    };
    const match = offered.find((k) => keys.split("\n").some((l) => l.includes(k.key)));
    if (match) {
      const bad = await badModes();
      if (bad) await appendAuth(`Authentication refused: bad ownership or modes for ${bad === ak ? "file" : "directory"} ${bad}`);
      else {
        await appendAuth(`Accepted publickey for ${user} from ${LOCAL_IP} port 51234 ssh2: ED25519 ${await fingerprint(match.key)}`);
        return { target, user, host, notes };
      }
    }
  }
  if (methods.includes("password") && !m.root.probing) {
    const shadow = await readDb(target, "/etc/shadow");
    const want = shadow.find((s) => s[0] === user)?.[1];
    for (let tries = 0; tries < 3; tries++) {
      const pw = await m.ask(`${notes}${user}@${host}'s password: `, { secret: true, fallback: user === USER ? SERVER_PASSWORD : "" });
      notes = "";
      if (account && want && pw && pwHash(pw) === want) {
        await appendAuth(`Accepted password for ${user} from ${LOCAL_IP} port 51234 ssh2`);
        return { target, user, host, notes };
      }
      await appendAuth(`Failed password for ${account ? "" : "invalid user "}${user} from ${LOCAL_IP} port 51234 ssh2`);
      if (tries < 2) notes = "Permission denied, please try again.\n";
    }
  }
  return { err: `${notes}${user}@${host}: Permission denied (${methods}).\n`, code: 255 };
}

function parseSshArgs(args: string[], portFlag: "p" | "P"): { o: SshOpts; rest: string[] } | { err: string } {
  const o: SshOpts = { options: {} };
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (rest.length && portFlag === "p") {
      rest.push(a);
      continue;
    }
    if (a === `-${portFlag}`) o.port = Number(args[++i]);
    else if (a === "-i") o.identity = args[++i];
    else if (a === "-l") o.user = args[++i];
    else if (a === "-o") {
      const [k, v] = (args[++i] ?? "").split("=");
      o.options[k.toLowerCase()] = v ?? "";
    } else if (a === "-L" || a === "-R" || a === "-D") {
      o.options[`forward${a}`] = args[++i] ?? "";
    } else if (/^-[a-zA-Z]+$/.test(a)) {
      for (const c of a.slice(1)) {
        if (c === "A") o.options.forwardagent = "yes";
        else if ("TtvqCNrRavzn46".includes(c)) o.options[`flag-${c}`] = "1";
        else return { err: `${portFlag === "p" ? "ssh" : "scp"}: unknown option -- ${c}` };
      }
    } else rest.push(a);
  }
  return { o, rest };
}

const MOTD = (m: Machine, user: string) =>
  `Welcome to Ubuntu 24.04.3 LTS (GNU/Linux 6.8.0-45-generic x86_64)\n\n * Documentation:  https://help.ubuntu.com\n * Management:     https://landscape.canonical.com\n * Support:        https://ubuntu.com/pro\n\n System information as of ${m.now().toUTCString()}\n\n  System load:  0.08               Processes:             ${112}\n  Usage of /:   27.9% of 28.89GB   Users logged in:       0\n  Memory usage: 17%                IPv4 address for eth0: ${SIM_HOSTS.find((h) => h.name === m.host)?.ip ?? LOCAL_IP}\n\n${user === "root" ? "" : `Last login: Mon Oct  5 17:02:11 2026 from ${LOCAL_IP}\n`}`;

async function sshCommand(m: Machine, args: string[], ctx: ResolvedCommandContext) {
  const parsed = parseSshArgs(args, "p");
  if ("err" in parsed) return fail(`${parsed.err}\nusage: ssh [-46AaCfGgKkMNnqsTtVvXxYy] [-B bind_interface] [-b bind_address]\n           [-c cipher_spec] [-D [bind_address:]port] [-E log_file]\n           [-i identity_file] [-L address] [-l login_name] [-o option]\n           [-p port] [-R address] destination [command [argument ...]]`, 255);
  const [dest, ...command] = parsed.rest;
  if (!dest) return fail("usage: ssh [-46AaCfGgKkMNnqsTtVvXxYy] [-B bind_interface] [-b bind_address]\n           [-c cipher_spec] [-D [bind_address:]port] [-E log_file]\n           [-i identity_file] [-L address] [-l login_name] [-o option]\n           [-p port] [-R address] destination [command [argument ...]]", 255);
  if (/(^|@)github\.com$/.test(dest)) return githubSsh(m).execute(args, ctx);
  const c = await connect(m, dest, parsed.o);
  if ("err" in c) return fail(c.err, c.code);
  let notes = c.notes;
  if (parsed.o.options["forward-L"] || parsed.o.options["forward-R"] || parsed.o.options["forward-D"]) notes += `${dim("(Port forwarding: on a real computer, this ssh would now also carry connections through the tunnel. The practice terminal logs you in without it.)")}\n`;
  if (command.length) {
    const line = command.join(" ");
    const r = await c.target.exec(line, String(ctx.stdin ?? ""));
    return { stdout: r.stdout, stderr: notes + r.stderr, exitCode: r.exitCode };
  }
  if (m !== m.root) return fail(`${notes}(The practice terminal opens one ssh session at a time. Type exit first, or run a single command: ssh ${dest} 'command'.)`, 255);
  if (!tty(ctx)) return fail(`${notes}Pseudo-terminal will not be allocated because stdin is not a terminal.`, 255);
  // A fresh login: start in the home folder, with the login files read.
  c.target.env = { ...c.target.env, PWD: HOME, OLDPWD: HOME };
  m.root.session = { m: c.target, sim: SIM_HOSTS.find((h) => h.name === c.target.host)!, shown: c.host };
  return ok(MOTD(c.target, c.user), notes);
}

/** "host:path" (scp, rsync) → the host part and the path part. */
function splitRemote(spec: string): { host?: string; path: string } {
  const m = /^((?:[^@/:]+@)?[^/:]+):(.*)$/.exec(spec);
  return m ? { host: m[1], path: m[2] } : { path: spec };
}

type Side = { m: Machine; path: string; label: string };

async function sideFor(m: Machine, spec: string, o: SshOpts): Promise<Side | { err: string; code: number }> {
  const s = splitRemote(spec);
  if (!s.host) return { m, path: join(m.cwd, s.path.replace(/^~(?=\/|$)/, HOME)), label: s.path };
  const c = await connect(m, s.host, o);
  if ("err" in c) return c;
  return { m: c.target, path: join(HOME, (s.path || ".").replace(/^~\/?/, "")), label: spec };
}

async function listFiles(side: Side, path: string): Promise<{ rel: string; dir: boolean }[]> {
  const out: { rel: string; dir: boolean }[] = [];
  const walk = async (p: string, rel: string) => {
    for (const n of (await side.m.fs.readdir(p)).sort()) {
      const full = `${p}/${n}`;
      const isDir = await side.m.perms.isDir(full);
      out.push({ rel: rel ? `${rel}/${n}` : n, dir: isDir });
      if (isDir) await walk(full, rel ? `${rel}/${n}` : n);
    }
  };
  await walk(path, "");
  return out;
}

async function copyFile(from: Side, fromPath: string, to: Side, toPath: string) {
  const bytes = await from.m.fs.readFileBuffer(fromPath);
  await to.m.fs.mkdir(dirname(toPath), { recursive: true });
  await to.m.fs.writeFile(toPath, bytes as unknown as string);
  const mode = await from.m.perms.mode(fromPath);
  if (mode !== undefined) await to.m.fs.chmod(toPath, mode & 0o777).catch(() => undefined);
}

async function scp(m: Machine, args: string[]) {
  const parsed = parseSshArgs(args, "P");
  if ("err" in parsed) return fail(`${parsed.err}\nusage: scp [-346ABCOpqRrsTv] [-c cipher] [-D sftp_server_path] [-F ssh_config]\n           [-i identity_file] [-J destination] [-l limit] [-o ssh_option]\n           [-P port] [-S program] [-X sftp_option] source ... target`, 1);
  const recursive = !!parsed.o.options["flag-r"];
  const specs = parsed.rest;
  if (specs.length < 2) return fail("usage: scp [-346ABCOpqRrsTv] [-c cipher] [-D sftp_server_path] [-F ssh_config]\n           [-i identity_file] [-J destination] [-l limit] [-o ssh_option]\n           [-P port] [-S program] [-X sftp_option] source ... target", 1);
  const dest = await sideFor(m, specs.at(-1)!, parsed.o);
  if ("err" in dest) return fail(dest.err, dest.code);
  let out = "";
  let err = "";
  for (const spec of specs.slice(0, -1)) {
    const src = await sideFor(m, spec, parsed.o);
    if ("err" in src) return fail(src.err, src.code);
    if (!(await src.m.perms.exists(src.path))) {
      err += `scp: ${splitRemote(spec).host ? `${src.path}` : spec}: No such file or directory\n`;
      continue;
    }
    const destIsDir = await dest.m.perms.isDir(dest.path);
    const target = destIsDir ? `${dest.path}/${basename(src.path)}` : dest.path;
    if (await src.m.perms.isDir(src.path)) {
      if (!recursive) {
        err += `scp: ${splitRemote(spec).host ? src.path : `local "${spec}"`} is not a regular file\nscp: failed to upload directory ${spec} to ${dest.label}\n`;
        continue;
      }
      try {
        await dest.m.fs.mkdir(target, { recursive: true });
        for (const f of await listFiles(src, src.path)) {
          if (f.dir) await dest.m.fs.mkdir(`${target}/${f.rel}`, { recursive: true });
          else {
            await copyFile(src, `${src.path}/${f.rel}`, dest, `${target}/${f.rel}`);
            const size = (await src.m.fs.stat(`${src.path}/${f.rel}`)).size;
            out += `${basename(f.rel).padEnd(46)} 100% ${String(size).padStart(5)}   ${(size / 1024 + 0.1).toFixed(1)}KB/s   00:00    \n`;
          }
        }
      } catch {
        err += `scp: dest open "${target}": Permission denied\nscp: failed to upload directory ${spec} to ${dest.label}\n`;
      }
      continue;
    }
    try {
      await copyFile(src, src.path, dest, target);
    } catch {
      err += `scp: dest open "${target}": Permission denied\nscp: failed to upload file ${spec} to ${dest.label}\n`;
      continue;
    }
    const size = (await src.m.fs.stat(src.path)).size;
    out += `${basename(src.path).padEnd(46)} 100% ${String(size).padStart(5)}   ${(size / 1024 + 0.1).toFixed(1)}KB/s   00:00    \n`;
  }
  return { stdout: out, stderr: err, exitCode: err ? 1 : 0 };
}

async function rsync(m: Machine, args: string[]) {
  let dry = false;
  let del = false;
  let verbose = false;
  let recursive = false;
  const excludes: string[] = [];
  const specs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--delete") del = true;
    else if (a === "--dry-run") dry = true;
    else if (a.startsWith("--exclude=")) excludes.push(a.slice(10));
    else if (a === "--exclude") excludes.push(args[++i] ?? "");
    else if (a === "--progress" || a === "--human-readable" || a === "--compress" || a === "--archive") {
      if (a === "--archive") recursive = true;
    } else if (a === "-e") i++;
    else if (/^-[a-zA-Z]+$/.test(a)) {
      if (/[ar]/.test(a)) recursive = true;
      if (a.includes("v")) verbose = true;
      if (a.includes("n")) dry = true;
    } else specs.push(a);
  }
  if (specs.length < 2) return fail("rsync  version 3.2.7  protocol version 31\nUsage: rsync [OPTION]... SRC [SRC]... DEST\n  or   rsync [OPTION]... SRC [SRC]... [USER@]HOST:DEST", 1);
  const o: SshOpts = { options: {} };
  const dest = await sideFor(m, specs.at(-1)!, o);
  if ("err" in dest) return fail(dest.err, dest.code);
  const excluded = (rel: string) => excludes.some((pat) => new RegExp(`(^|/)${pat.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, ".")}(/|$)`).test(rel));
  let listed = "";
  let sent = 0;
  let total = 0;
  for (const spec of specs.slice(0, -1)) {
    const src = await sideFor(m, spec, o);
    if ("err" in src) return fail(src.err, src.code);
    if (!(await src.m.perms.exists(src.path))) return fail(`rsync: [sender] link_stat "${src.path}" failed: No such file or directory (2)\nrsync error: some files/attrs were not transferred (see previous errors) (code 23) at main.c(1338) [sender=3.2.7]`, 23);
    const isDir = await src.m.perms.isDir(src.path);
    // "site/" copies what's inside site; "site" copies the folder itself.
    const contentsOnly = spec.endsWith("/");
    const base = isDir && !contentsOnly ? `${dest.path}/${basename(src.path)}` : isDir ? dest.path : (await dest.m.perms.isDir(dest.path)) ? `${dest.path}/${basename(src.path)}` : dest.path;
    const prefix = isDir && !contentsOnly ? `${basename(src.path)}/` : "";
    if (isDir && !recursive) {
      listed += `skipping directory ${basename(src.path)}\n`;
      continue;
    }
    const files = isDir ? await listFiles(src, src.path) : [{ rel: "", dir: false }];
    if (isDir && !(await dest.m.perms.exists(base))) {
      listed += prefix || "./\n";
      if (prefix) listed = listed.replace(/\/$/, "/\n");
      if (!dry) await dest.m.fs.mkdir(base, { recursive: true });
    }
    for (const f of files) {
      if (f.rel && excluded(f.rel)) continue;
      const from = f.rel ? `${src.path}/${f.rel}` : src.path;
      const to = f.rel ? `${base}/${f.rel}` : base;
      const name = f.rel ? `${prefix}${f.rel}` : basename(src.path);
      if (f.dir) {
        if (!(await dest.m.perms.exists(to))) {
          listed += `${name}/\n`;
          if (!dry) await dest.m.fs.mkdir(to, { recursive: true });
        }
        continue;
      }
      const bytes = await src.m.fs.readFileBuffer(from);
      total += bytes.length;
      let same = false;
      if (await dest.m.perms.exists(to)) {
        const theirs = await dest.m.fs.readFileBuffer(to).catch(() => undefined);
        same = !!theirs && theirs.length === bytes.length && theirs.every((b, i) => b === bytes[i]);
      }
      if (same) continue;
      listed += `${name}\n`;
      sent += bytes.length;
      if (!dry) await copyFile(src, from, dest, to);
    }
    if (del && isDir && (await dest.m.perms.exists(base))) {
      const have = new Set(files.map((f) => f.rel));
      const theirs = await listFiles({ ...dest, path: base }, base);
      for (const f of theirs.reverse()) {
        if (have.has(f.rel) || excluded(f.rel)) continue;
        listed = `deleting ${prefix}${f.rel}${f.dir ? "/" : ""}\n${listed}`;
        if (!dry) await dest.m.fs.rm(`${base}/${f.rel}`, { recursive: true, force: true });
      }
    }
  }
  if (!verbose) return ok("");
  const fmt = (n: number) => n.toLocaleString("en-US");
  const sentBytes = sent + 120;
  return ok(`sending incremental file list\n${listed}\nsent ${fmt(sentBytes)} bytes  received ${fmt(dry ? 19 : 35 + Math.floor(sent / 50))} bytes  ${fmt(Math.round(sentBytes * 2))}.00 bytes/sec\ntotal size is ${fmt(total)}  speedup is ${(total / (sentBytes + 35)).toFixed(2)}${dry ? " (DRY RUN)" : ""}\n`);
}

async function sshCopyId(m: Machine, args: string[]) {
  const parsed = parseSshArgs(args, "p");
  if ("err" in parsed) return fail(parsed.err);
  const dest = parsed.rest[0];
  if (!dest) return fail("Usage: /usr/bin/ssh-copy-id [-h|-?|-f|-n|-s|-x] [-i [identity_file]] [-p port] [-F alternative ssh_config file] [-t target_path] [[-o <ssh -o options>] ...] [user@]hostname", 1);
  const file = parsed.o.identity ? join(m.cwd, parsed.o.identity.replace(/^~/, HOME)) : `${HOME}/.ssh/id_ed25519`;
  const pubPath = file.endsWith(".pub") ? file : `${file}.pub`;
  const pub = (await m.fs.readFile(pubPath).catch(() => "")) ?? "";
  if (!pub.trim()) return fail("/usr/bin/ssh-copy-id: ERROR: No identities found", 1);
  let out = `/usr/bin/ssh-copy-id: INFO: Source of key(s) to be installed: "${pubPath}"\n/usr/bin/ssh-copy-id: INFO: attempting to log in with the new key(s), to filter out any that are already installed\n`;
  // Already there? (logging in with the key works)
  const already = await connect(m, dest, { ...parsed.o, options: { ...parsed.o.options } });
  const key = pub.trim().split(/\s+/).slice(0, 2).join(" ");
  if (!("err" in already)) {
    const home = (await readDb(already.target, "/etc/passwd")).find((u) => u[0] === already.user)?.[5] ?? HOME;
    const keys = (await readAsRoot(already.target, `${home}/.ssh/authorized_keys`)) ?? "";
    if (keys.includes(key)) return ok(`${out}\n/usr/bin/ssh-copy-id: WARNING: All keys were skipped because they already exist on the remote system.\n\t\t(if you think this is a mistake, you may want to use -f option)\n\n`);
  }
  out += `/usr/bin/ssh-copy-id: INFO: 1 key(s) remain to be installed -- if you are prompted now it is to install the new keys\n`;
  const c = "err" in already ? await connect(m, dest, parsed.o, { forCopyId: true }) : already;
  if ("err" in c) return { stdout: out, stderr: c.err, exitCode: 1 };
  const home = (await readDb(c.target, "/etc/passwd")).find((u) => u[0] === c.user)?.[5] ?? HOME;
  await c.target.asRoot(async () => {
    await c.target.fs.mkdir(`${home}/.ssh`, { recursive: true });
    await c.target.fs.chmod(`${home}/.ssh`, 0o700);
    await c.target.fs.appendFile(`${home}/.ssh/authorized_keys`, `${pub.trim()}\n`);
    await c.target.fs.chmod(`${home}/.ssh/authorized_keys`, 0o600);
    for (const p of [`${home}/.ssh`, `${home}/.ssh/authorized_keys`]) c.target.perms.setOwner(p, c.user, c.user);
  });
  return ok(`${out}\nNumber of key(s) added: 1\n\nNow try logging into the machine, with:   "ssh '${dest}'"\nand check to make sure that only the key(s) you wanted were added.\n\n`);
}

export function netCommands(m: Machine): Command[] {
  return [
    // For lesson set-ups and hidden checks only (root): prepare a server's files, or run a
    // command on it as root. Everyone else gets "command not found".
    cmd("practice-host", async (args) => {
      if (!m.perms.root) return fail(`bash: practice-host: command not found`, 127);
      const [name, ...rest] = args;
      if (!rest.length) return (await m.prepareServer(name)) ? ok() : fail(`practice-host: no server called ${name}`);
      const s = await m.server(name);
      if (!s) return fail(`practice-host: no server called ${name}`);
      return s.asRoot(() => s.exec(rest.join(" ")));
    }),
    cmd("curl", (args, ctx) => curl(m, args, ctx)),
    cmd("wget", (args, ctx) => wget(m, args, ctx)),
    cmd("ping", (args, ctx) => ping(m, args, ctx)),
    cmd("dig", (args) => dig(m, args)),
    cmd("host", async (args) => {
      const name = args.find((a) => !a.startsWith("-"));
      if (!name) return fail("Usage: host [-aCdilrTvVw] [-c class] [-N ndots] [-t type] [-W time]\n            [-R number] [-m flag] [-p port] hostname [server]");
      const hit = dnsLookup(name);
      if (!hit) return fail(`Host ${name} not found: 3(NXDOMAIN)`);
      return ok(`${hit.cname ? `${name} is an alias for ${hit.cname}.\n` : ""}${hit.cname ?? name} has address ${hit.ip}\n`);
    }),
    cmd("nslookup", async (args) => {
      const name = args.find((a) => !a.startsWith("-"));
      if (!name) return fail("nslookup: give a name to look up, for example: nslookup inkwell.example");
      const hit = dnsLookup(name);
      const head = "Server:\t\t127.0.0.53\nAddress:\t127.0.0.53#53\n\n";
      if (!hit) return fail(`${head}** server can't find ${name}: NXDOMAIN\n`);
      return ok(`${head}Non-authoritative answer:\n${hit.cname ? `${name}\tcanonical name = ${hit.cname}.\n` : ""}Name:\t${hit.cname ?? name}\nAddress: ${hit.ip}\n\n`);
    }),
    cmd("nc", async (args) => {
      const { flags, operands } = parseArgs(args, "w");
      const [host, portText] = operands;
      if (!flags.has("z") || !host || !portText) return fail("usage: nc [-46CDdFhklNnrStUuvZz] [-I length] [-i interval] [-M ttl]\n\t  [-m minttl] [-O length] [-P proxy_username] [-p source_port]\n\t  [-q seconds] [-s sourceaddr] [-T keyword] [-V rtable] [-W recvlimit]\n\t  [-w timeout] [-X proxy_protocol] [-x proxy_address[:port]]\n\t  [destination] [port]\n(The practice terminal's nc checks whether a port is open: nc -zv host port.)", 1);
      const port = Number(portText);
      const r = await resolve(m, host);
      if (!r) return fail(`nc: getaddrinfo for host "${host}" port ${port}: Temporary failure in name resolution`);
      const target = await machineFor(m, r);
      const svc = SERVICE_NAMES[port] ? `tcp/${SERVICE_NAMES[port]}` : "tcp/*";
      if (target) {
        if (!(await firewallAllows(target, port, target === m))) return fail(`nc: connect to ${host} (${r.ip}) port ${port} (tcp) timed out: Operation now in progress`);
        const open = (await target.services.listening()).some((l) => l.port === port);
        if (!open) return fail(`nc: connect to ${host} (${r.ip}) port ${port} (tcp) failed: Connection refused`);
      } else if (r.net?.down || (port !== 80 && port !== 443 && !(port === 22 && host.includes("github")))) return fail(`nc: connect to ${host} (${r.ip}) port ${port} (tcp) timed out: Operation now in progress`);
      return ok("", flags.has("v") ? `Connection to ${host} (${r.ip}) ${port} port [${svc}] succeeded!\n` : "");
    }),
    cmd("ss", (args) => sockets(m, args, false)),
    cmd("netstat", async (args) => (await needPackage(m, "netstat")) ?? sockets(m, args, true)),
    cmd("ip", async (args) => ipCommand(m, args)),
    cmd("ifconfig", async () => {
      const missing = await needPackage(m, "ifconfig");
      if (missing) return missing;
      const ip = m.host === HOST ? LOCAL_IP : (SIM_HOSTS.find((h) => h.name === m.host)?.ip ?? LOCAL_IP);
      return ok(`eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n        inet ${ip}  netmask 255.255.255.0  broadcast ${ip.split(".").slice(0, 3).join(".")}.255\n        ether 52:54:00:12:34:56  txqueuelen 1000  (Ethernet)\n\nlo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536\n        inet 127.0.0.1  netmask 255.0.0.0\n        loop  txqueuelen 1000  (Local Loopback)\n\n`);
    }),
    cmd("route", async () => (await needPackage(m, "route")) ?? ok(`Kernel IP routing table\nDestination     Gateway         Genmask         Flags Metric Ref    Use Iface\ndefault         10.0.2.2        0.0.0.0         UG    100    0        0 eth0\n10.0.2.0        0.0.0.0         255.255.255.0   U     100    0        0 eth0\n`)),
    cmd("ufw", async (args) => ufw(m, args)),
    cmd("ssh", (args, ctx) => sshCommand(m, args, ctx)),
    cmd("scp", (args) => scp(m, args)),
    cmd("rsync", (args) => rsync(m, args)),
    cmd("ssh-copy-id", (args) => sshCopyId(m, args)),
  ];
}
