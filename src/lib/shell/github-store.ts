// What the pretend GitHub knows about each repository besides its Git data: pull requests,
// issues, labels, releases, rulesets, Actions runs, secrets. Kept as JSON inside the bare
// repository (mp-github.json), so it travels with it and nothing else needs a database.
import type { Machine } from "./machine";
import type { Repo } from "./git/repo";

export type Review = { author: string; state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED"; body: string };
export type Comment = { author: string; body: string };

export type Pull = {
  number: number;
  title: string;
  body: string;
  /** The branch with the changes ("fix-typo"), and the repository it lives in when it's a fork. */
  head: string;
  headRepo?: string;
  base: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  draft: boolean;
  author: string;
  how?: string;
  reviews?: Review[];
  comments?: Comment[];
  labels?: string[];
  reviewers?: string[];
  assignees?: string[];
  milestone?: string;
  mergedSha?: string;
};

export type Issue = { number: number; title: string; body: string; state: "OPEN" | "CLOSED"; author: string; labels?: string[]; milestone?: string; assignees?: string[]; comments?: Comment[]; reason?: string };

export type Label = { name: string; color: string; description: string };
export type Release = { tag: string; name: string; notes: string; draft: boolean; prerelease: boolean; author: string; target: string };

export type RuleType = "pull_request" | "required_status_checks" | "non_fast_forward" | "deletion" | "creation" | "update" | "required_signatures" | "required_linear_history";
export type Ruleset = {
  id: number;
  name: string;
  target: "branch" | "tag";
  enforcement: "active" | "evaluate" | "disabled";
  conditions: { ref_name: { include: string[]; exclude: string[] } };
  rules: { type: RuleType; parameters?: Record<string, unknown> }[];
};

export type StepLog = { name: string; conclusion: "success" | "failure" | "skipped"; log: string[] };
export type JobRun = { id: number; name: string; conclusion: "success" | "failure" | "skipped"; steps: StepLog[] };
export type Run = { id: number; number: number; workflow: string; file: string; event: string; branch: string; sha: string; title: string; conclusion: "success" | "failure"; jobs: JobRun[]; created: number; pr?: number };

export type Store = {
  next: number;
  pulls: Pull[];
  issues: Issue[];
  description?: string;
  visibility?: string;
  labels?: Label[];
  milestones?: { number: number; title: string; state: "open" | "closed" }[];
  releases?: Release[];
  rulesets?: Ruleset[];
  runs?: Run[];
  secrets?: Record<string, string>;
  variables?: Record<string, string>;
  forkOf?: string;
  /** Push protection (secret scanning when you push). On unless a set-up turns it off. */
  pushProtection?: boolean;
  pages?: string;
};

export const STORE = "mp-github.json";

export const DEFAULT_LABELS: Label[] = [
  { name: "bug", color: "d73a4a", description: "Something isn't working" },
  { name: "documentation", color: "0075ca", description: "Improvements or additions to documentation" },
  { name: "duplicate", color: "cfd3d7", description: "This issue or pull request already exists" },
  { name: "enhancement", color: "a2eeef", description: "New feature or request" },
  { name: "good first issue", color: "7057ff", description: "Good for newcomers" },
  { name: "help wanted", color: "008672", description: "Extra attention is needed" },
  { name: "invalid", color: "e4e669", description: "This doesn't seem right" },
  { name: "question", color: "d876e3", description: "Further information is requested" },
  { name: "wontfix", color: "ffffff", description: "This will not be worked on" },
];

export async function readStore(m: Machine, bare: Repo): Promise<Store> {
  const t = await m.root.asRoot(() => bare.readText(STORE));
  return t ? (JSON.parse(t) as Store) : { next: 1, pulls: [], issues: [] };
}

export async function writeStore(m: Machine, bare: Repo, s: Store) {
  await m.root.asRoot(() => bare.writeText(STORE, `${JSON.stringify(s, null, 1)}\n`));
}

/** "inkwell/site" for a bare repository at /srv/git/github.com/inkwell/site.git. */
export function repoName(bare: Repo): string {
  return bare.gitdir.replace(/^\/srv\/git\/github\.com\//, "").replace(/\.git$/, "");
}

/** Whether a ruleset's conditions cover a branch. */
export function rulesetApplies(r: Ruleset, branch: string, defaultBranch: string): boolean {
  if (r.enforcement !== "active" || r.target !== "branch") return false;
  const match = (pat: string) => {
    if (pat === "~ALL") return true;
    if (pat === "~DEFAULT_BRANCH") return branch === defaultBranch;
    const p = pat.replace(/^refs\/heads\//, "");
    return new RegExp(`^${p.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*")}$`).test(branch);
  };
  return r.conditions.ref_name.include.some(match) && !r.conditions.ref_name.exclude.some(match);
}
