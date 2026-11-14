/**
 * Shared helpers for the factory scripts: paths, a small frontmatter reader, and the loaders for plans and docs/roadmap.md.
 *
 * Deliberately dependency-free so the scripts run before `npm install`. The frontmatter reader handles only the YAML the factory writes: `key: scalar`, `key: [a, b]`, and `key:` followed by `- item` lines.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repo root is the folder holding `.factory/`. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const FACTORY = join(ROOT, '.factory');
export const PLANS_DIR = 'docs/plans';
export const ROADMAP_FILE = 'docs/roadmap.md';
export const INTAKE_DIR = 'docs/intake';
export const INTAKE_KINDS = ['bug', 'spec', 'follow-up', 'idea'];
export const INTAKE_STATUSES = ['new', 'parked'];
export const CHANGELOG_DIR = 'docs/changelog';

export const PLAN_STATUSES = ['draft', 'ready', 'building', 'merged', 'dropped', 'superseded'];
/** Statuses whose PR has merged, so a plan that `needs` one is free to start. */
export const PLAN_DONE = ['merged'];
export const PLAN_KINDS = ['feature', 'bug', 'chore'];
/** A plan's title is its PR title: a Conventional Commit with no scope. */
export const PR_TITLE = /^(feat|fix|refactor|docs|chore|test|ci|build): \S/;

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

/** A file source that reads either the working tree or a git ref, so `next.mjs --ref origin/main` sees what is merged. */
export function fileSource(ref) {
  if (!ref) {
    return {
      read: (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf8') : undefined),
      list: (dir) => (existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).map((f) => `${dir}/${f}`) : []),
    };
  }
  return {
    read: (rel) => tryGit(['show', `${ref}:${rel}`]),
    list: (dir) => (tryGit(['ls-tree', '--name-only', `${ref}`, `${dir}/`]) ?? '').split('\n').filter(Boolean),
  };
}

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

/** Splits a markdown file into `{ data, body, hasFrontmatter }`. */
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

// ---------------------------------------------------------------------------
// Plans and the roadmap
// ---------------------------------------------------------------------------

function asList(value) {
  if (value === undefined || value === '') return [];
  return (Array.isArray(value) ? value : [value]).map((x) => String(x).trim().replace(/^`|`$/g, '')).filter((x) => x && x !== '—' && x.toLowerCase() !== 'none');
}

/** A plan path as written in `needs`, `builds-on` or a PR body, made repo-relative. */
export function planPath(ref) {
  return ref.startsWith('docs/') ? ref : `${PLANS_DIR}/${ref.replace(/^\.\.?\//, '')}`;
}

/** Loads one plan. Plans without frontmatter are listed but never treated as buildable. */
export function loadPlan(source, rel) {
  const text = source.read(rel);
  if (text === undefined) return undefined;
  const { data, hasFrontmatter } = parseFrontmatter(text);
  return {
    path: rel,
    slug: rel.split('/').pop().replace(/\.md$/, ''),
    data,
    hasFrontmatter,
    title: data.title ?? '',
    status: String(data.status ?? '').toLowerCase(),
    pr: data.pr ? String(data.pr).replace(/^#/, '') : undefined,
    needs: asList(data.needs).map(planPath),
    owns: asList(data.owns),
    proves: data.proves ?? '',
  };
}

export function listPlans(source) {
  return source.list(PLANS_DIR).filter((p) => p.endsWith('.md') && !p.endsWith('README.md'));
}

/** Reads docs/roadmap.md: every checklist line in file order, with its section and the files it links (resolved relative to the roadmap). */
export function parseRoadmap(text) {
  const { data, body } = parseFrontmatter(text);
  const lines = [];
  let section = '';
  body.split(/\r?\n/).forEach((line, idx) => {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      section = h[1];
      return;
    }
    const item = /^\s*-\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    if (!item) return;
    const links = [...item[2].matchAll(/\]\(([^)\s]+?\.md)(#[^)]*)?\)/g)].map((m) => posix.normalize(posix.join(posix.dirname(ROADMAP_FILE), m[1])));
    const title = /\[([^\]]+)\]\(/.exec(item[2])?.[1] ?? /\*\*(.+?)\*\*/.exec(item[2])?.[1] ?? item[2].slice(0, 80);
    lines.push({ done: item[1] !== ' ', section, title, text: item[2], links, line: idx + 1 });
  });
  return { data, lines };
}

/** True when two `owns` entries can touch the same file. Globs are compared by their literal prefix, which errs towards reporting a collision. */
export function ownsOverlap(a, b) {
  const prefix = (p) => p.replace(/\s*\(.*\)\s*$/, '').split(/[*{[]/)[0];
  const pa = prefix(a);
  const pb = prefix(b);
  return pa.startsWith(pb) || pb.startsWith(pa);
}

/** Open PRs and the plans each claims, read from the `Plan:` line the PR body opens with. Undefined when `gh` is unavailable. */
export function openPrClaims() {
  let raw;
  try {
    raw = execFileSync('gh', ['pr', 'list', '--state', 'open', '--limit', '200', '--json', 'number,title,body,headRefName,isDraft'], {
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
    const plansPart = line.split(/\*\*Stacked on/i)[0];
    for (const m of plansPart.matchAll(/([\w./-]+\.md)/g)) {
      claims.push({ plan: planPath(m[1]), pr: pr.number, branch: pr.headRefName, draft: pr.isDraft });
    }
  }
  return claims;
}
