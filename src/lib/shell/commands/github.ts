// SSH keys and the GitHub CLI, for the GitHub lessons. "GitHub" is the folder of bare
// repositories in /srv/git/github.com (see git/remote.ts), the learner's account is "learner",
// and pull requests and issues are kept in a small JSON file inside each repository.
import type { Command, ResolvedCommandContext } from "just-bash";
import type { G } from "../git/context";
import { GH_LOGIN, GITHUB_KEYS, GITHUB_ROOT, knownHost } from "../git/remote";
import { GitError, exists } from "../git/repo";
import type { Machine } from "../machine";
import { HOME, USER, dirname, fail, join, ok, parseArgs } from "../util";

const GH_USER = USER;

function randomBase64(n: number) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function readText(ctx: ResolvedCommandContext, path: string) {
  try {
    return await ctx.fs.readFile(path);
  } catch {
    return undefined;
  }
}

/** The learner's public keys: "ssh-ed25519 AAAA…" (type and key, without the comment). */
async function publicKeys(ctx: ResolvedCommandContext): Promise<{ file: string; key: string; comment: string }[]> {
  let names: string[] = [];
  try {
    names = await ctx.fs.readdir(`${HOME}/.ssh`);
  } catch {
    return [];
  }
  const out = [];
  for (const n of names.filter((f) => f.endsWith(".pub")).sort()) {
    const parts = ((await readText(ctx, `${HOME}/.ssh/${n}`)) ?? "").trim().split(/\s+/);
    if (parts.length >= 2) out.push({ file: `${HOME}/.ssh/${n}`, key: `${parts[0]} ${parts[1]}`, comment: parts.slice(2).join(" ") });
  }
  return out;
}

async function githubKeys(m: Machine, ctx: ResolvedCommandContext): Promise<string> {
  return m.asRoot(async () => (await readText(ctx, GITHUB_KEYS)) ?? "");
}

// ----- ssh-keygen, ssh-agent, ssh-add, ssh -----

function sshKeygen(m: Machine): Command {
  return {
    name: "ssh-keygen",
    async execute(args, ctx) {
      const { values, flags } = parseArgs(args, "tCfNbR");
      if (values.R !== undefined) {
        // Forget a host's key (after it legitimately changed).
        const file = values.f ? join(ctx.cwd, values.f.replace(/^~/, HOME)) : `${HOME}/.ssh/known_hosts`;
        const text = await readText(ctx, file);
        if (text === undefined) return fail(`do_known_hosts: hostkeys_foreach failed for ${file}: No such file or directory`, 255);
        const lines = text.split("\n");
        const hits = lines.map((l, i) => [l, i] as const).filter(([l]) => l.split(/\s+/)[0]?.split(",").includes(values.R));
        if (!hits.length) return ok();
        await ctx.fs.writeFile(`${file}.old`, text);
        await ctx.fs.writeFile(file, lines.filter((_, i) => !hits.some(([, j]) => j === i)).join("\n"));
        return ok(`${hits.map(([, i]) => `# Host ${values.R} found: line ${i + 1}`).join("\n")}\n${file} updated.\nOriginal contents retained as ${file}.old\n`);
      }
      if (flags.has("l")) {
        const file = values.f ?? `${HOME}/.ssh/id_ed25519.pub`;
        const t = await readText(ctx, file.endsWith(".pub") ? file : `${file}.pub`);
        if (!t) return fail(`${file} is not a public key file.`, 255);
        const parts = t.trim().split(/\s+/);
        return ok(`256 SHA256:${parts[1].slice(10, 53)} ${parts.slice(2).join(" ")} (ED25519)\n`);
      }
      const type = values.t ?? "ed25519";
      if (!["ed25519", "rsa", "ecdsa"].includes(type)) return fail(`unknown key type ${type}`);
      const comment = values.C ?? `${USER}@inkwell`;
      let out = `Generating public/private ${type} key pair.\n`;
      let file = values.f ? join(ctx.cwd, values.f.replace(/^~/, HOME)) : undefined;
      const fallback = `${HOME}/.ssh/id_${type}`;
      if (!file) {
        const answer = (await m.ask(`${out}Enter file in which to save the key (${fallback}): `, { fallback: "" })).trim();
        out = "";
        file = answer ? join(ctx.cwd, answer.replace(/^~/, HOME)) : fallback;
      }
      if (await exists(ctx.fs, file)) {
        const again = (await m.ask(`${out}${file} already exists.\nOverwrite (y/n)? `, { fallback: "n" })).trim();
        if (!/^y/i.test(again)) return { stdout: "", stderr: "", exitCode: 1 };
        out = "";
      }
      if (values.N === undefined) {
        const p1 = await m.ask(`${out}Enter passphrase for "${file}" (empty for no passphrase): `, { secret: true, fallback: "" });
        const p2 = await m.ask("Enter same passphrase again: ", { secret: true, fallback: "" });
        out = "";
        if (p1 !== p2) return fail("Passphrases do not match.  Try again.");
      }
      await ctx.fs.mkdir(dirname(file), { recursive: true });
      if (dirname(file) === `${HOME}/.ssh`) await ctx.fs.chmod(`${HOME}/.ssh`, 0o700);
      const body = randomBase64(32);
      const keyType = type === "ed25519" ? "ssh-ed25519" : type === "rsa" ? "ssh-rsa" : "ecdsa-sha2-nistp256";
      const pub = `${keyType} AAAAC3NzaC1lZDI1NTE5AAAAI${body.slice(0, 43)} ${comment}\n`;
      await ctx.fs.writeFile(file, `-----BEGIN OPENSSH PRIVATE KEY-----\n${randomBase64(160).match(/.{1,70}/g)!.join("\n")}\n-----END OPENSSH PRIVATE KEY-----\n`);
      await ctx.fs.chmod(file, 0o600);
      await ctx.fs.writeFile(`${file}.pub`, pub);
      await ctx.fs.chmod(`${file}.pub`, 0o644);
      const fp = randomBase64(32).replace(/=+$/, "").slice(0, 43);
      out +=
        `Your identification has been saved in ${file}\nYour public key has been saved in ${file}.pub\nThe key fingerprint is:\nSHA256:${fp} ${comment}\nThe key's randomart image is:\n` +
        `+--[${type.toUpperCase()} 256]--+\n|        .o+*=o   |\n|       . ooB+.   |\n|        o.=o+    |\n|       . +.o .   |\n|        S.+ .    |\n|       . = o     |\n|        o =      |\n|       . o .     |\n|        E.       |\n+----[SHA256]-----+\n`;
      return ok(out);
    },
  };
}

function sshAgent(): Command {
  return {
    name: "ssh-agent",
    async execute() {
      return ok("SSH_AUTH_SOCK=/tmp/ssh-XXXXk2Lq/agent.4242; export SSH_AUTH_SOCK;\nSSH_AGENT_PID=4243; export SSH_AGENT_PID;\necho Agent pid 4243;\n");
    },
  };
}

function sshAdd(): Command {
  return {
    name: "ssh-add",
    async execute(args, ctx) {
      const { flags, long, operands } = parseArgs(args);
      if (long.some((l) => l.startsWith("apple"))) return fail(`ssh-add: illegal option -- -\n(--apple-use-keychain only exists on a Mac. On Linux, use ssh-add ~/.ssh/id_ed25519.)`);
      const added = (await readText(ctx, `${HOME}/.ssh/.agent`)) ?? "";
      if (flags.has("l")) {
        if (!added.trim()) return fail("The agent has no identities.");
        return ok(added);
      }
      const file = operands[0] ? join(ctx.cwd, operands[0].replace(/^~/, HOME)) : `${HOME}/.ssh/id_ed25519`;
      const pub = await readText(ctx, `${file}.pub`);
      if (!pub) return fail(`${file}: No such file or directory`);
      const parts = pub.trim().split(/\s+/);
      const line = `256 SHA256:${parts[1].slice(12, 55)} ${parts.slice(2).join(" ")} (ED25519)\n`;
      if (!added.includes(line)) await ctx.fs.appendFile(`${HOME}/.ssh/.agent`, line);
      return { stdout: "", stderr: `Identity added: ${file} (${parts.slice(2).join(" ")})\n`, exitCode: 0 };
    },
  };
}

/** `ssh git@github.com`: GitHub answers, but gives no shell (net.ts handles every other host). */
export function githubSsh(m: Machine): Command {
  return {
    name: "ssh",
    async execute(args, ctx) {
      const { operands } = parseArgs(args, "pilo");
      const target = operands[0];
      if (!target) return fail("usage: ssh [-T] [-i identity_file] [-p port] destination [command]", 255);
      const host = await knownHost(m, ctx.fs);
      if (!host.ok) return fail(host.text, 255);
      const keys = await githubKeys(m, ctx);
      const mine = await publicKeys(ctx);
      if (!mine.some((k) => keys.includes(k.key))) return { stdout: "", stderr: `${host.text}git@github.com: Permission denied (publickey).\n`, exitCode: 255 };
      return { stdout: "", stderr: `${host.text}Hi ${GH_USER}! You've successfully authenticated, but GitHub does not provide shell access.\n`, exitCode: 1 };
    },
  };
}

// ----- gh -----


async function loggedIn(ctx: ResolvedCommandContext) {
  const t = await readText(ctx, GH_LOGIN);
  if (!t) return undefined;
  return { protocol: /git_protocol:\s*ssh/.test(t) ? "ssh" : "https" };
}

const NOT_LOGGED_IN = "To get started with GitHub CLI, please run:  gh auth login\nAlternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.";

/** The GitHub repository behind the current folder's `origin` remote (or `-R owner/name`). */
export async function ghAuth(g: G, ctx: ResolvedCommandContext, args: string[]) {
  const [sub, ...rest] = args;
  if (sub === "status") {
    const li = await loggedIn(ctx);
    if (!li) throw new GitError("You are not logged into any GitHub hosts. To log in, run: gh auth login", 1);
    g.out += `github.com\n  ✓ Logged in to github.com account ${GH_USER} (${GH_LOGIN})\n  - Active account: true\n  - Git operations protocol: ${li.protocol}\n  - Token: gho_************************************\n  - Token scopes: 'gist', 'read:org', 'repo'\n`;
    return;
  }
  if (sub === "logout") {
    await ctx.fs.rm(GH_LOGIN, { force: true }).catch(() => undefined);
    g.out += `✓ Logged out of github.com account ${GH_USER}\n`;
    return;
  }
  if (sub !== "login") throw new GitError(`unknown command "${sub ?? ""}" for "gh auth"`, 1);
  const { long } = parseArgs(rest);
  let protocol = long.find((l) => l.startsWith("git-protocol="))?.split("=")[1];
  if (!protocol) {
    const a = (await g.m.ask("? Where do you use GitHub? GitHub.com\n? What is your preferred protocol for Git operations on this host? [HTTPS/SSH] ", { fallback: "HTTPS" })).trim().toLowerCase();
    protocol = a.startsWith("s") ? "ssh" : "https";
  }
  let uploaded = "";
  if (protocol === "ssh") {
    const keys = await publicKeys(ctx);
    if (keys.length) {
      const a = (await g.m.ask(`? Upload your SSH public key to your GitHub account? ${keys[0].file} [Y/n] `, { fallback: "n" })).trim();
      if (!/^n/i.test(a)) {
        await addKey(g, ctx, keys[0].file, "GitHub CLI");
        uploaded = `✓ Uploaded the SSH key to your account: ${keys[0].file}\n`;
      }
    }
  }
  g.out +=
    "? How would you like to authenticate GitHub CLI? Login with a web browser\n\n! First copy your one-time code: 4F2C-9A1D\nPress Enter to open https://github.com/login/device in your browser...\n" +
    "(The practice computer pretends you entered the code in the browser and approved it.)\n✓ Authentication complete.\n" +
    `- gh config set -h github.com git_protocol ${protocol}\n✓ Configured git protocol\n${uploaded}✓ Logged in as ${GH_USER}\n`;
  await ctx.fs.mkdir(dirname(GH_LOGIN), { recursive: true });
  await ctx.fs.writeFile(GH_LOGIN, `github.com:\n    user: ${GH_USER}\n    oauth_token: gho_practice_token\n    git_protocol: ${protocol}\n`);
  await ctx.fs.chmod(GH_LOGIN, 0o600);
}

async function addKey(g: G, ctx: ResolvedCommandContext, file: string, title: string) {
  const t = (await readText(ctx, file))?.trim();
  if (!t || !/^ssh-|^ecdsa-/.test(t)) throw new GitError(`could not read public key from ${file}`, 1);
  if (/PRIVATE KEY/.test(t)) throw new GitError("that's a private key: add the .pub file instead", 1);
  const key = t.split(/\s+/).slice(0, 2).join(" ");
  const existing = await githubKeys(g.m, ctx);
  if (!existing.includes(key)) {
    await g.m.asRoot(async () => {
      await ctx.fs.mkdir(GITHUB_ROOT, { recursive: true });
      await ctx.fs.appendFile(GITHUB_KEYS, `${key} ${title}\n`);
    });
  }
}

export async function ghSshKey(g: G, ctx: ResolvedCommandContext, args: string[]) {
  if (!(await loggedIn(ctx))) throw new GitError(NOT_LOGGED_IN, 4);
  const [sub, ...rest] = args;
  if (sub === "list") {
    const keys = (await githubKeys(g.m, ctx)).trim();
    g.out += keys ? `${keys.split("\n").map((l) => { const [t, k, ...title] = l.split(" "); return `${title.join(" ") || "key"}\t${t} ${k.slice(0, 20)}…\tauthentication`; }).join("\n")}\n` : "";
    return;
  }
  if (sub !== "add") throw new GitError(`unknown command "${sub ?? ""}" for "gh ssh-key"`, 1);
  const { values, long, operands } = parseArgs(rest, "t");
  const file = operands[0] ? join(ctx.cwd, operands[0].replace(/^~/, HOME)) : undefined;
  if (!file) throw new GitError("public key file missing", 1);
  await addKey(g, ctx, file, values.t ?? long.find((l) => l.startsWith("title="))?.slice(6) ?? "inkwell");
  g.out += "✓ Public key added to your account\n";
}

export function githubCommands(m: Machine): Command[] {
  return [sshKeygen(m), sshAgent(), sshAdd()];
}
