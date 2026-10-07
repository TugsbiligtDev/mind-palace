// GitHub Actions on the pretend GitHub (Module 41): when you push, or open or update a pull
// request, every workflow in .github/workflows whose `on:` matches runs on a fresh practice
// computer (an "ubuntu-latest" runner). `run:` steps really run there in bash, with the
// repository checked out by actions/checkout; a few well-known actions are modelled. Results
// are stored with the repository, for `gh run list`, `gh run view` and pull request checks.
import { parse as parseYaml } from "yaml";
import type { Repo } from "./git/repo";
import { type JobRun, type Run, type StepLog, type Store, readStore, repoName, writeStore } from "./github-store";
import type { Machine } from "./machine";

type Step = { name?: string; uses?: string; run?: string; with?: Record<string, unknown>; env?: Record<string, unknown>; if?: string; id?: string; "working-directory"?: string };
type Job = { name?: string; "runs-on"?: unknown; needs?: string | string[]; steps?: Step[]; env?: Record<string, unknown>; if?: string };
type Workflow = { name?: string; on?: unknown; env?: Record<string, unknown>; jobs?: Record<string, Job> };

export type Trigger = { event: "push" | "pull_request" | "workflow_dispatch"; branch: string; sha: string; base?: string; pr?: number; actor: string; workflowFile?: string };

function triggers(on: unknown, t: Trigger): boolean {
  const branchMatch = (filters: unknown, name: string) => {
    if (!filters) return true;
    const list = Array.isArray(filters) ? filters : [filters];
    return list.some((f) => new RegExp(`^${String(f).replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*")}$`).test(name));
  };
  if (typeof on === "string") return on === t.event;
  if (Array.isArray(on)) return on.includes(t.event);
  if (on && typeof on === "object") {
    const o = on as Record<string, unknown>;
    if (!(t.event in o)) return false;
    const cfg = (o[t.event] ?? {}) as Record<string, unknown>;
    if (t.event === "push") return branchMatch(cfg.branches, t.branch) && !(cfg["branches-ignore"] && branchMatch(cfg["branches-ignore"], t.branch));
    if (t.event === "pull_request") return branchMatch(cfg.branches, t.base ?? "main");
    return true;
  }
  return false;
}

/** ${{ github.sha }}, ${{ secrets.TOKEN }} and friends. */
function expand(text: string, ctx: Record<string, string>, secrets: Record<string, string>): string {
  return text.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_, expr: string) => {
    const e = expr.trim();
    if (e.startsWith("secrets.")) return secrets[e.slice(8)] ?? "";
    if (e in ctx) return ctx[e];
    return "";
  });
}

function evalIf(cond: string | undefined, ctx: Record<string, string>, failed: boolean): boolean {
  if (!cond) return !failed;
  const c = cond.replace(/^\$\{\{\s*|\s*\}\}$/g, "").trim();
  if (c === "always()") return true;
  if (c === "failure()") return failed;
  if (c === "success()") return !failed;
  if (c === "cancelled()") return false;
  const eq = /^([\w.]+)\s*(==|!=)\s*'([^']*)'$/.exec(c);
  if (eq) return !failed && (eq[2] === "==" ? ctx[eq[1]] === eq[3] : ctx[eq[1]] !== eq[3]);
  return !failed;
}

let runCounter = 0;

/** Runs the workflows a push or pull request triggers. Returns the runs it made. */
export async function runWorkflows(m: Machine, bare: Repo, t: Trigger): Promise<Run[]> {
  const files = await m.root.asRoot(() => bare.commitFiles(t.sha));
  const workflows = [...files.keys()].filter((p) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p)).sort();
  if (!workflows.length) return [];
  const store = await readStore(m, bare);
  const made: Run[] = [];
  const commit = await m.root.asRoot(() => bare.readCommit(t.sha));
  for (const path of workflows) {
    if (t.workflowFile && !path.endsWith(`/${t.workflowFile}`)) continue;
    let wf: Workflow;
    try {
      wf = parseYaml(await m.root.asRoot(() => bare.readBlobText(files.get(path)!.sha))) as Workflow;
    } catch (e) {
      // A broken workflow file fails at once, as on GitHub.
      const run: Run = { id: 0, number: 0, workflow: path.split("/").pop()!, file: path, event: t.event, branch: t.branch, sha: t.sha, title: commit.message.split("\n")[0], conclusion: "failure", jobs: [{ id: 0, name: "(workflow file)", conclusion: "failure", steps: [{ name: "Parse workflow", conclusion: "failure", log: [`Invalid workflow file: ${path}`, String((e as Error).message).split("\n")[0]] }] }], created: Math.floor(m.now().getTime() / 1000) };
      made.push(run);
      continue;
    }
    if (!wf || typeof wf !== "object" || !triggers(wf.on ?? (wf as Record<string, unknown>)[true as unknown as string], t)) continue;
    const name = wf.name ?? path.split("/").pop()!;
    const run: Run = { id: 0, number: 0, workflow: name, file: path, event: t.event, branch: t.branch, sha: t.sha, title: commit.message.split("\n")[0], conclusion: "success", jobs: [], created: Math.floor(m.now().getTime() / 1000), pr: t.pr };
    const ctx: Record<string, string> = {
      "github.sha": t.sha,
      "github.ref": `refs/heads/${t.branch}`,
      "github.ref_name": t.branch,
      "github.event_name": t.event,
      "github.actor": t.actor,
      "github.repository": repoName(bare),
      "github.repository_owner": repoName(bare).split("/")[0],
      "github.workspace": `/home/runner/work/${repoName(bare).split("/")[1]}/${repoName(bare).split("/")[1]}`,
      "github.run_number": "1",
    };
    for (const [k, v] of Object.entries(store.variables ?? {})) ctx[`vars.${k}`] = v;
    const done = new Map<string, JobRun>();
    const order = Object.entries(wf.jobs ?? {});
    for (let pass = 0; pass < order.length && done.size < order.length; pass++) {
      for (const [id, job] of order) {
        if (done.has(id)) continue;
        const needs = job.needs ? (Array.isArray(job.needs) ? job.needs : [job.needs]) : [];
        if (needs.some((n) => !done.has(n))) continue;
        const needFailed = needs.some((n) => done.get(n)!.conclusion !== "success");
        const jr = needFailed || !evalIf(job.if, ctx, false) ? { id: 0, name: job.name ?? id, conclusion: "skipped" as const, steps: [] } : await runJob(m, bare, t, files, id, job, { ...wf.env, ...job.env }, ctx, store.secrets ?? {});
        done.set(id, jr);
        run.jobs.push(jr);
      }
    }
    if (run.jobs.some((j) => j.conclusion === "failure")) run.conclusion = "failure";
    made.push(run);
  }
  if (!made.length) return made;
  const fresh = await readStore(m, bare);
  fresh.runs ??= [];
  for (const r of made) {
    runCounter++;
    r.id = 11000000000 + (fresh.runs.length + 1) * 7 + runCounter * 0;
    r.number = fresh.runs.filter((x) => x.file === r.file).length + 1;
    r.jobs.forEach((j, i) => (j.id = 31000000000 + (fresh.runs!.length + 1) * 10 + i));
    fresh.runs.push(r);
  }
  await writeStore(m, bare, fresh);
  return made;
}

async function runJob(m: Machine, bare: Repo, t: Trigger, files: Map<string, { sha: string; mode: string }>, id: string, job: Job, env: Record<string, unknown>, ctx: Record<string, string>, secrets: Record<string, string>): Promise<JobRun> {
  const { Machine } = await import("./machine");
  const runner = await Machine.create("", { now: m.now });
  // ubuntu-latest comes with these.
  await runner.asRoot(() => runner.exec("apt-get install -y -q shellcheck jq zip unzip > /dev/null 2>&1"));
  const ws = ctx["github.workspace"];
  await runner.asRoot(async () => {
    await runner.fs.mkdir(ws, { recursive: true });
    runner.perms.setOwner(ws, "learner", "learner");
  });
  const secretValues = Object.values(secrets).filter(Boolean);
  const mask = (s: string) => secretValues.reduce((acc, v) => acc.split(v).join("***"), s);
  const steps: StepLog[] = [{ name: "Set up job", conclusion: "success", log: ["Current runner version: '2.329.0'", "Operating System", "  Ubuntu", "  24.04.3", "  LTS", "Runner Image", "  Image: ubuntu-24.04"] }];
  let failed = false;
  const baseEnv: Record<string, string> = { ...runner.env, CI: "true", GITHUB_ACTIONS: "true", GITHUB_SHA: t.sha, GITHUB_REF: `refs/heads/${t.branch}`, GITHUB_REF_NAME: t.branch, GITHUB_REPOSITORY: ctx["github.repository"], GITHUB_EVENT_NAME: t.event, GITHUB_WORKSPACE: ws, GITHUB_ACTOR: t.actor, RUNNER_OS: "Linux", PWD: ws };
  for (const [k, v] of Object.entries(env ?? {})) baseEnv[k] = expand(String(v), ctx, secrets);
  for (const [i, step] of (job.steps ?? []).entries()) {
    const label = step.name ?? (step.uses ? `Run ${step.uses}` : `Run ${String(step.run ?? "").split("\n")[0]}`);
    if (!evalIf(step.if, ctx, failed)) {
      steps.push({ name: label, conclusion: "skipped", log: [] });
      continue;
    }
    const stepEnv: Record<string, string> = { ...baseEnv };
    for (const [k, v] of Object.entries(step.env ?? {})) stepEnv[k] = expand(String(v), ctx, secrets);
    const log: string[] = [];
    let ok = true;
    if (step.uses) {
      const action = step.uses.split("@")[0];
      if (action === "actions/checkout") {
        await runner.asRoot(async () => {
          for (const [p, f] of files) {
            const bytes = await m.root.asRoot(() => bare.readBlob(f.sha));
            const full = `${ws}/${p}`;
            await runner.fs.mkdir(full.slice(0, full.lastIndexOf("/")), { recursive: true });
            await runner.fs.writeFile(full, bytes as unknown as string);
            if (f.mode === "100755") await runner.fs.chmod(full, 0o755);
            runner.perms.setOwner(full, "learner", "learner");
          }
        });
        log.push(`Syncing repository: ${ctx["github.repository"]}`, "Getting Git version info", `Checking out the ref`, `HEAD is now at ${t.sha.slice(0, 7)} ${(await m.root.asRoot(() => bare.readCommit(t.sha))).message.split("\n")[0]}`);
      } else if (/shellcheck/i.test(action)) {
        const r = await runner.asRoot(() => runner.bash.exec("set -o pipefail; find . -name '*.sh' -not -path './.git/*' | sort | xargs -r shellcheck", { cwd: ws, env: stepEnv }));
        log.push(...`${r.stdout}${r.stderr}`.split("\n").filter((l) => l !== ""));
        ok = r.exitCode === 0;
      } else if (action === "actions/upload-pages-artifact") {
        const dir = String(step.with?.path ?? ".");
        await runner.asRoot(async () => runner.fs.writeFile("/tmp/.pages-path", `${dir}\n`));
        log.push(`Uploading ${dir} as the "github-pages" artifact`, "Artifact github-pages has been successfully uploaded!");
      } else if (action === "actions/deploy-pages") {
        const dir = (await runner.asRoot(() => runner.fs.readFile("/tmp/.pages-path").catch(() => ""))).trim();
        if (!dir) {
          ok = false;
          log.push("Error: No uploaded artifact was found! Please check if there are any errors at build step, or uploaded artifact name is correct.");
        } else {
          const [owner, name] = ctx["github.repository"].split("/");
          const dest = `/srv/internet/${owner}.github.io/${name}`;
          const src = dir.startsWith("/") ? dir : `${ws}/${dir.replace(/^\.\/?/, "")}`.replace(/\/$/, "");
          await m.root.asRoot(async () => {
            await m.root.fs.rm(dest, { recursive: true, force: true });
            await m.root.fs.mkdir(dest, { recursive: true });
          });
          const copy = async (from: string, to: string) => {
            for (const n of await runner.asRoot(() => runner.fs.readdir(from))) {
              const f = `${from}/${n}`;
              if (await runner.perms.isDir(f)) {
                await m.root.asRoot(() => m.root.fs.mkdir(`${to}/${n}`, { recursive: true }));
                await copy(f, `${to}/${n}`);
              } else {
                const b = await runner.asRoot(() => runner.fs.readFileBuffer(f));
                await m.root.asRoot(() => m.root.fs.writeFile(`${to}/${n}`, b as unknown as string));
              }
            }
          };
          await copy(src, dest);
          const store = await readStore(m, bare);
          store.pages = `https://${owner}.github.io/${name}/`;
          await writeStore(m, bare, store);
          log.push("Fetching artifact metadata", "Creating Pages deployment", `Reported success! Your site is live at ${store.pages}`);
        }
      } else {
        log.push(`Download action repository '${step.uses}'`, `Run ${step.uses}`);
        if (step.with) for (const [k, v] of Object.entries(step.with)) log.push(`  with:`, `    ${k}: ${v}`);
      }
    } else if (step.run !== undefined) {
      const script = expand(String(step.run), ctx, secrets);
      const cwd = step["working-directory"] ? `${ws}/${step["working-directory"]}` : ws;
      log.push(...script.split("\n").filter(Boolean).map((l) => `\x1b[36m${l}\x1b[0m`));
      const r = await runner.asRoot(() => runner.bash.exec(`set -eo pipefail\n${script}`, { cwd, env: stepEnv }));
      log.push(...mask(`${r.stdout}${r.stderr}`).split("\n").filter((l) => l !== "").map((l) => l.replace(/^bash: line \d+: /, "")));
      if (r.exitCode !== 0) {
        ok = false;
        log.push(`##[error]Process completed with exit code ${r.exitCode}.`);
      }
    }
    steps.push({ name: label, conclusion: ok ? "success" : "failure", log });
    if (!ok) failed = true;
    void i;
  }
  steps.push({ name: "Complete job", conclusion: "success", log: ["Cleaning up orphan processes"] });
  return { id: 0, name: job.name ?? id, conclusion: failed ? "failure" : "success", steps };
}

/** The newest run of each workflow for a commit (what a pull request's checks show). */
export function latestRuns(store: Store, sha: string): Run[] {
  const out = new Map<string, Run>();
  for (const r of store.runs ?? []) if (r.sha === sha) out.set(r.file + r.event, r);
  return [...out.values()];
}
