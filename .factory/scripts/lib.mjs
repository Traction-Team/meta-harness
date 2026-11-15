/**
 * Shared helpers for the factory scripts: the settings reader, a small frontmatter reader, and the loaders for plans, feature docs, the roadmap, intake notes and changelog entries.
 *
 * Deliberately dependency-free so the scripts run in a fresh worktree before any install. Every repository path is a setting in docs/factory.md, read through the same file source as the documents, so `--ref origin/<trunk>` sees merged settings and a repository that keeps its docs elsewhere still works.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root is the folder holding `.factory/`, not `git rev-parse`, so a copied factory works from wherever it was dropped. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const FACTORY = join(ROOT, '.factory');

/** The repository-owned settings file. It is created on import from the template below and never shipped in a fab. */
export const SETTINGS_FILE = 'docs/factory.md';
export const SETTINGS_TEMPLATE = '.factory/templates/setup/factory.md';
export const SETTINGS_MISSING = `${SETTINGS_FILE} is missing: copy ${SETTINGS_TEMPLATE} there and set its values`;

/**
 * Every setting, with its template default. An empty value means off or none. `verify` is the one value a repository must set: it is checked for `<set me>` and reported until it is filled in.
 */
export const DEFAULTS = Object.freeze({
  trunk: 'main',
  verify: '<set me>',
  setup: '',
  metafab: 'npx --yes @seasb/metafab',
  agent: 'opencode',
  'orca-repo': '',
  'sub-agent-coding': 'agent-coding',
  'sub-agent-review': 'agent-review',
  'sub-agent-planning': 'agent-planning',
  'amp-model-coding': '',
  'amp-model-review': '',
  specs: '',
  plans: 'docs/plans',
  'plan-names': 'dated',
  roadmap: 'docs/roadmap.md',
  'roadmap-max-lines': '',
  intake: 'docs/intake',
  changelog: 'docs/changelog',
  features: '',
  stacking: 'off',
  'review-bots': '',
  'docs-changes': 'pull-request',
  approvers: '',
  'check-changed': '',
  'test-file': '',
  'dev-server': '',
  release: 'off',
  'release-branch': 'production',
  'release-guide': 'docs/releasing.md',
  'release-risky-paths': 'none',
  'release-announce': 'none',
});

export const SETTING_KEYS = Object.keys(DEFAULTS);

export const PLAN_NAMES = ['numbered', 'dated'];
export const STACKING = ['on', 'off'];
export const DOCS_CHANGES = ['direct', 'pull-request'];
export const RELEASE = ['on', 'off'];

export const PLAN_STATUSES = ['draft', 'ready', 'building', 'merged', 'live', 'dropped', 'superseded'];
/** Statuses whose pull request has merged, so a plan that `needs` one is free to start. */
export const PLAN_DONE = ['merged', 'live'];
export const PLAN_KINDS = ['feature', 'bug', 'chore'];
/** A plan's title is its pull request title: a Conventional Commit with no scope. */
export const PR_TITLE = /^(feat|fix|refactor|docs|chore|test|ci|build): \S/;
/** A plan code within a feature (`ONB-3`); a feature code is what it names (`ONB`). */
export const FEATURE_CODE = /^[A-Z][A-Z0-9]{1,4}$/;
export const PLAN_CODE = /^([A-Z][A-Z0-9]{1,4})-(\d+)$/;
export const FEATURE_STATUSES = ['planning', 'building', 'done', 'dropped'];

export const INTAKE_KINDS = ['bug', 'spec', 'follow-up', 'idea', 'tooling', 'feedback'];
export const INTAKE_STATUSES = ['new', 'parked'];

/** `numbered` plan files: `<round>.<NNN>-<slug>.md`. */
export const NUMBERED_PLAN = /^([1-9]\d*\.\d{3})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
/** `dated` plan files: `YYYY-MM-DD-[<code>-<n>-]<slug>.md`; the code part exists only when `features` is set. */
export const DATED_PLAN = /^(\d{4}-\d{2}-\d{2})-(?:([a-z][a-z0-9]{0,4})-(\d+)-)?([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

/** Trims a leading `./` and any trailing slash from a repository path. */
export function repoPath(value) {
  return String(value ?? '').trim().replace(/^\.\//, '').replace(/\/+$/, '');
}

export function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

export function tryGit(args) {
  try {
    return git(args);
  } catch {
    return undefined;
  }
}

/**
 * A file source that reads either the working tree or a git ref, so `next.mjs --ref origin/main` sees what is merged rather than what this branch has edited.
 *
 * `list` returns the entries of a directory and `listDirs` only its directories, because a sightings folder is a directory beside the note it belongs to.
 */
export function fileSource(ref) {
  if (!ref) {
    return {
      read: (rel) => {
        const path = join(ROOT, rel);
        return existsSync(path) && statSync(path).isFile() ? readFileSync(path, 'utf8') : undefined;
      },
      list: (dir) => (existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).map((f) => `${dir}/${f}`) : []),
      listDirs: (dir) =>
        existsSync(join(ROOT, dir))
          ? readdirSync(join(ROOT, dir), { withFileTypes: true })
              .filter((d) => d.isDirectory())
              .map((d) => `${dir}/${d.name}`)
          : [],
    };
  }
  return {
    read: (rel) => tryGit(['show', `${ref}:${rel}`]),
    list: (dir) => (tryGit(['ls-tree', '--name-only', `${ref}`, `${dir}/`]) ?? '').split('\n').filter(Boolean),
    listDirs: (dir) => (tryGit(['ls-tree', '--name-only', '-d', `${ref}`, `${dir}/`]) ?? '').split('\n').filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Levenshtein distance, for `did you mean`. */
function distance(a, b) {
  const rows = [];
  for (let i = 0; i <= a.length; i++) rows.push([i]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return rows[a.length][b.length];
}

/** The closest setting name, or undefined when nothing is close enough to be worth suggesting. */
function closestSetting(key) {
  let best;
  for (const candidate of SETTING_KEYS) {
    const d = distance(key, candidate);
    if (!best || d < best.d) best = { candidate, d };
  }
  return best && best.d <= 3 ? best.candidate : undefined;
}

/** Splits a table row on unescaped `|` only, so a command value can hold `\|`. Outer cells are dropped and each cell is trimmed. */
function splitRow(line) {
  const cells = [];
  let cell = '';
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '\\' && line[i + 1] === '|') {
      cell += '|';
      i += 1;
      continue;
    }
    if (char === '|') {
      cells.push(cell);
      cell = '';
      continue;
    }
    cell += char;
  }
  cells.push(cell);
  if (cells.length && cells[0].trim() === '') cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === '') cells.pop();
  return cells.map((c) => c.trim());
}

/** Strips one pair of backticks, so a value can be written as a code span. */
function unquote(value) {
  return value.length > 1 && value.startsWith('`') && value.endsWith('`') ? value.slice(1, -1) : value;
}

const SEPARATOR_CELL = /^:?-{3,}:?$/;

/**
 * Reads a settings document. The first table whose header row is `| Setting | Value |` is the settings table; more columns are allowed and ignored. CRLF and a BOM are accepted.
 *
 * Returns `{ values, errors, warnings }`. `values` holds every setting, with the template default for an absent key. An unknown key is a warning with a suggestion, `<set me>` is an error naming the key, and a key set twice is an error naming both lines; the first value is kept, because editing a file should not silently change a decision.
 */
export function parseSettings(text) {
  const errors = [];
  const warnings = [];
  const values = { ...DEFAULTS };
  const body = String(text ?? '').replace(/^\uFEFF/, '');
  const lines = body.split(/\r?\n/);

  let header = -1;
  for (let i = 0; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (cells.length >= 2 && cells[0].toLowerCase() === 'setting' && cells[1].toLowerCase() === 'value') {
      header = i;
      break;
    }
  }
  if (header < 0) {
    warnings.push(`${SETTINGS_FILE}: no "| Setting | Value |" table; copy ${SETTINGS_TEMPLATE} there`);
    return { values, keys: [], errors, warnings };
  }

  const first = new Map();
  for (let i = header + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) break;
    const cells = splitRow(line);
    if (cells.length === 0 || cells.every((c) => c === '' || SEPARATOR_CELL.test(c))) continue;
    const key = unquote(cells[0] ?? '');
    if (key === '') continue;
    const value = unquote(cells[1] ?? '');
    if (!(key in DEFAULTS)) {
      const hint = closestSetting(key);
      warnings.push(`${SETTINGS_FILE}:${i + 1}: unknown setting "${key}"${hint ? `; did you mean "${hint}"?` : ''}`);
      continue;
    }
    if (first.has(key)) {
      errors.push(`${SETTINGS_FILE}:${i + 1}: setting "${key}" is set twice (first on line ${first.get(key) + 1}); the first value is used`);
      continue;
    }
    first.set(key, i);
    values[key] = value;
  }

  for (const key of SETTING_KEYS) {
    if (values[key] !== '<set me>') continue;
    const line = first.get(key);
    const where = line === undefined ? SETTINGS_FILE : `${SETTINGS_FILE}:${line + 1}`;
    errors.push(`${where}: setting "${key}" is still <set me>; set it`);
  }
  return { values, keys: [...first.keys()], errors, warnings };
}

/**
 * Reads docs/factory.md through a file source. A missing file returns the defaults and the error that says how to create it, so `check.mjs` reports one problem instead of failing on the first read.
 */
export function readSettings(source) {
  const text = source.read(SETTINGS_FILE);
  if (text === undefined) {
    return { values: { ...DEFAULTS }, keys: [], errors: [SETTINGS_MISSING], warnings: [] };
  }
  return parseSettings(text);
}

/** Reports settings problems on stderr, for a script that reads settings but does not validate them. */
export function reportSettings({ errors, warnings }, log = console.error) {
  for (const w of warnings) log(`! ${w}`);
  for (const e of errors) log(`✗ ${e}`);
}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

/** Drops a trailing ` # comment`, leaving a `#` inside quotes alone. */
function stripComment(raw) {
  const v = raw.trim();
  const q = v[0];
  if (q === '"' || q === "'") {
    const end = v.indexOf(q, 1);
    if (end > 0) return v.slice(0, end + 1);
  }
  if (v.startsWith('#')) return '';
  return v.replace(/\s+#.*$/, '');
}

function parseScalar(raw) {
  const v = stripComment(raw);
  if (v === '') return '';
  if (v.length > 1 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) return v.slice(1, -1);
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((x) => parseScalar(x));
  }
  return v;
}

/** Splits a markdown file into `{ data, body, hasFrontmatter }`. Handles only the YAML the factory writes: `key: scalar`, `key: [a, b]`, and `key:` followed by `- item` lines. */
export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { data: {}, body: text, hasFrontmatter: false };
  const data = {};
  let current;
  for (const line of match[1].split(/\r?\n/)) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    const top = /^([A-Za-z0-9_-]+):(.*)$/.exec(line);
    if (top) {
      current = top[1];
      const rest = stripComment(top[2]);
      data[current] = rest === '' || rest === '|' || rest === '>' ? undefined : parseScalar(rest);
      continue;
    }
    if (!current) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && (data[current] === undefined || Array.isArray(data[current]))) {
      data[current] = [...(data[current] ?? []), parseScalar(item[1])];
    } else {
      const prev = typeof data[current] === 'string' ? `${data[current]}\n` : '';
      data[current] = `${prev}${line.trim()}`;
    }
  }
  return { data, body: text.slice(match[0].length), hasFrontmatter: true };
}

export function asList(value) {
  if (value === undefined || value === '') return [];
  return (Array.isArray(value) ? value : [value]).map((x) => String(x).trim().replace(/^`|`$/g, '')).filter((x) => x && x !== '—' && x.toLowerCase() !== 'none');
}

// ---------------------------------------------------------------------------
// Plans and feature docs
// ---------------------------------------------------------------------------

/** A plan path as written in `needs`, `builds-on` or a PR body, made repo-relative. */
export function planPath(ref, settings) {
  const plans = repoPath(settings.plans);
  const clean = repoPath(ref);
  if (clean.startsWith(`${plans}/`) || clean.startsWith('docs/')) return clean;
  return `${plans}/${clean.replace(/^\.\.?\//, '')}`;
}

/** Loads one plan. Plans without frontmatter are listed but never treated as buildable. */
export function loadPlan(source, rel, settings) {
  const text = source.read(rel);
  if (text === undefined) return undefined;
  const { data, hasFrontmatter } = parseFrontmatter(text);
  const code = data.code ? String(data.code).trim() : undefined;
  return {
    path: rel,
    slug: rel.split('/').pop().replace(/\.md$/, ''),
    data,
    hasFrontmatter,
    code,
    feature: PLAN_CODE.exec(code ?? '')?.[1],
    title: data.title ?? '',
    status: String(data.status ?? '').toLowerCase(),
    pr: data.pr ? String(data.pr).replace(/^#/, '') : undefined,
    needs: asList(data.needs).map((ref) => planPath(ref, settings)),
    owns: asList(data.owns),
    proves: data.proves ?? '',
  };
}

export const isFactoryPlan = (plan) => Boolean(plan?.hasFrontmatter);

export function listPlans(source, settings) {
  return source.list(repoPath(settings.plans)).filter((p) => p.endsWith('.md') && !p.endsWith('README.md'));
}

/** Loads one feature doc from `<features>/<code>-<slug>.md`. `priority` is an optional number that orders the features, lowest first. */
export function loadFeature(source, rel) {
  const text = source.read(rel);
  if (text === undefined) return undefined;
  const { data, hasFrontmatter } = parseFrontmatter(text);
  const priority = String(data.priority ?? '').trim();
  return {
    path: rel,
    slug: rel.split('/').pop().replace(/\.md$/, ''),
    data,
    hasFrontmatter,
    code: data.code ? String(data.code).trim() : undefined,
    title: data.title ?? '',
    status: String(data.status ?? '').toLowerCase(),
    priority: /^\d+$/.test(priority) ? Number(priority) : undefined,
  };
}

export function listFeatures(source, settings) {
  if (!settings.features) return [];
  return source.list(repoPath(settings.features)).filter((p) => p.endsWith('.md') && !p.endsWith('README.md'));
}

/** Orders plan codes numerically within a feature, so ONB-10 comes after ONB-9. Takes a plan (with `path`) or a listed entry (with `plan`). */
export function byCode(a, b) {
  const pa = PLAN_CODE.exec(a.code ?? '');
  const pb = PLAN_CODE.exec(b.code ?? '');
  if (pa && pb) return pa[1].localeCompare(pb[1]) || Number(pa[2]) - Number(pb[2]);
  if (pa || pb) return pa ? -1 : 1;
  return String(a.path ?? a.plan ?? '').localeCompare(String(b.path ?? b.plan ?? ''));
}

/**
 * The branch a plan is built on: `<type>/<file name without the date>`, with the plan's code in front when the file name does not already start with it, so every branch, worktree and pull request of a feature reads `onb-3-…`. A numbered plan keeps its number, so its branch is `feat/1.005-check`.
 */
export function planBranch(plan) {
  const type = /^([a-z]+)/.exec(plan.title)?.[1] ?? 'feat';
  const slug = plan.slug.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  const code = plan.code?.toLowerCase();
  return `${type}/${code && !slug.startsWith(`${code}-`) ? `${code}-${slug}` : slug}`;
}

// ---------------------------------------------------------------------------
// The roadmap
// ---------------------------------------------------------------------------

const MD_LINK = /\[([^\]]*)\]\(([^)\s]+?\.md)(#[^)]*)?\)/g;

/**
 * A roadmap line's title. A line with a plan link takes the plan link's text, so a line whose first link is a spec and whose second is the plan is still named after the plan. A line without one takes its first `**bold**` text, then the text before the first `: ` with links reduced to their text, then its first 80 characters. Trimmed.
 */
export function roadmapTitle(text, links, settings) {
  const plans = repoPath(settings.plans);
  const planLink = links.find((link) => link.path.startsWith(`${plans}/`));
  if (planLink) return planLink.text.trim();
  const bold = /\*\*(.+?)\*\*/.exec(text)?.[1];
  if (bold) return bold.trim();
  const plain = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^\s*\[[ xX]\]\s*/, '');
  const cut = plain.indexOf(': ');
  return (cut >= 0 ? plain.slice(0, cut) : plain.slice(0, 80)).trim();
}

/**
 * Reads the roadmap: every checklist line in file order, with its section and the files it links (resolved against the roadmap's directory). Both line shapes are read: a numbered line links its plan and names it in the link text, and a dated line carries a bold title, a state and a `plans:` link.
 */
export function parseRoadmap(text, settings) {
  const { data, body } = parseFrontmatter(text);
  const base = posix.dirname(repoPath(settings.roadmap)) || '.';
  const lines = [];
  let section = '';
  body.split(/\r?\n/).forEach((line, idx) => {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      section = heading[1];
      return;
    }
    const item = /^\s*-\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    if (!item) return;
    const raw = item[2];
    const links = [...raw.matchAll(MD_LINK)].map((m) => ({ text: m[1], path: posix.normalize(posix.join(base, m[2])) }));
    lines.push({ done: item[1] !== ' ', section, title: roadmapTitle(raw, links, settings), text: raw, links, line: idx + 1 });
  });
  return { data, lines };
}

// ---------------------------------------------------------------------------
// Pull requests
// ---------------------------------------------------------------------------

/** True when two `owns` entries can touch the same file. Globs are compared by their literal prefix, which errs towards reporting a collision. */
export function ownsOverlap(a, b) {
  const prefix = (p) => p.replace(/\s*\(.*\)\s*$/, '').split(/[*{[]/)[0];
  const pa = prefix(a);
  const pb = prefix(b);
  return pa.startsWith(pb) || pb.startsWith(pa);
}

/** Open pull requests and the plans each claims, read from the `Plan:` line the pull request body opens with. Undefined when `gh` is unavailable. */
export function openPrClaims(settings) {
  let raw;
  try {
    raw = execFileSync('gh', ['pr', 'list', '--state', 'open', '--limit', '200', '--json', 'number,title,body,headRefName,baseRefName,isDraft'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return undefined;
  }
  const claims = [];
  for (const pr of JSON.parse(raw)) {
    const line = /^\s*\**Plan:?\**:?\s*(.+)$/im.exec(pr.body ?? '')?.[1] ?? '';
    // Stop at the `Stacked on` part so a stacked branch name ending in `.md` is never read as a plan.
    const [plansPart, stackedPart = ''] = line.split(/\*\*Stacked on:?\**:?/i);
    const stackedOn = /#(\d+)/.exec(stackedPart)?.[1];
    for (const m of plansPart.matchAll(/([\w./-]+\.md)/g)) {
      claims.push({ plan: planPath(m[1], settings), pr: pr.number, branch: pr.headRefName, base: pr.baseRefName, stackedOn, draft: pr.isDraft });
    }
  }
  return claims;
}
