/**
 * Shared helpers for the factory scripts: paths, a small frontmatter reader, the factory's skills and pipeline, the root AGENTS.md block, and the loaders for plans and docs/roadmap.md.
 *
 * Deliberately dependency-free so the scripts run before `npm install`. The frontmatter reader handles only the YAML the factory writes: `key: scalar`, `key: [a, b]`, and `key:` followed by `- item` lines.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
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

/** Where skills are linked. Stand-in for `metafab build` until plan 1.004 lands. */
export const TARGET_DIRS = ['.claude/skills', '.agents/skills'];

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
// The factory: skills, pipeline, and the root AGENTS.md block
// ---------------------------------------------------------------------------

/** Every skill under `.factory/`: a directory holding `SKILL.md`. Dot-directories are skipped and skills are not searched for nested skills. */
export function listSkills() {
  const skills = [];
  const walk = (rel) => {
    for (const entry of readdirSync(join(FACTORY, rel), { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (existsSync(join(FACTORY, childRel, 'SKILL.md'))) {
        const { data, hasFrontmatter } = parseFrontmatter(readFileSync(join(FACTORY, childRel, 'SKILL.md'), 'utf8'));
        skills.push({ name: entry.name, rel: childRel, isWorkflow: childRel.startsWith('workflows/'), data, hasFrontmatter });
      } else {
        walk(childRel);
      }
    }
  };
  if (existsSync(FACTORY)) walk('');
  return skills.sort((a, b) => a.rel.localeCompare(b.rel));
}

/**
 * Reads `.factory/factory.yaml`'s pipeline. Handles the two entry forms the format defines:
 *   - workflow-name
 *   - workflow-name: { stop: text }
 */
export function readPipeline() {
  const file = join(FACTORY, 'factory.yaml');
  if (!existsSync(file)) return [];
  const entries = [];
  let inPipeline = false;
  readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, idx) => {
    if (/^pipeline:\s*$/.test(line)) {
      inPipeline = true;
      return;
    }
    if (inPipeline && /^\S/.test(line)) inPipeline = false;
    if (!inPipeline) return;
    const m = /^\s+-\s+([A-Za-z0-9_-]+)\s*(?::\s*\{\s*stop:\s*(.+?)\s*\}\s*)?(?:#.*)?$/.exec(line);
    if (m) entries.push({ workflow: m[1], stop: m[2] ? parseScalar(m[2]) : undefined, line: idx + 1 });
    else if (/^\s+-/.test(line)) entries.push({ workflow: undefined, raw: line.trim(), line: idx + 1 });
  });
  return entries;
}

export const BLOCK_START = '<!-- factory:start -->';
export const BLOCK_END = '<!-- factory:end -->';
const BLOCK_RE = /<!-- factory:start -->\n[\s\S]*?<!-- factory:end -->\n?/;

/** The root AGENTS.md block, in the shape docs/specs/building.md defines for `metafab build`. */
export function renderBlock() {
  const standing = existsSync(join(FACTORY, 'AGENTS.md')) ? readFileSync(join(FACTORY, 'AGENTS.md'), 'utf8').replace(/\r\n/g, '\n').trim() : '';
  const pipeline = readPipeline().filter((e) => e.workflow);
  const parts = [BLOCK_START, '<!-- Generated by node .factory/scripts/link.mjs from .factory/. Edit .factory/, then run it again. -->', ''];
  if (standing) parts.push(standing, '');
  if (pipeline.length) {
    parts.push('## Pipeline', '', 'Work moves through these workflows in order. When one ends, suggest the next.', '');
    pipeline.forEach((e, i) => {
      const stop = e.stop ? `. Then stop: ${e.stop}${/[.!?]$/.test(e.stop) ? '' : '.'}` : '';
      parts.push(`${i + 1}. \`${e.workflow}\`${stop}`);
    });
    parts.push('');
  }
  parts.push(
    '## Factory source',
    '',
    'This repository stores its factory in `.factory/`. Edit that directory and run `node .factory/scripts/link.mjs`.',
    'Do not edit the skill links in `.claude/skills/` or `.agents/skills/`.',
    BLOCK_END,
  );
  return `${parts.join('\n')}\n`;
}

/** AGENTS.md with the block replaced, or appended when the markers are missing. Text outside the markers is left as it is. */
export function applyBlock(text, block = renderBlock()) {
  if (text === undefined || text.trim() === '') return block;
  if (BLOCK_RE.test(text)) return text.replace(BLOCK_RE, block);
  return `${text.replace(/\n*$/, '\n\n')}${block}`;
}

/** What `link.mjs` should make each link: `{ path, target }`, plus problems such as duplicate names. */
export function desiredLinks(skills = listSkills()) {
  const links = [];
  const problems = [];
  const seen = new Map();
  for (const s of skills) {
    if (seen.has(s.name)) {
      problems.push(`.factory/${s.rel}: same name as .factory/${seen.get(s.name)}; skill names must be unique`);
      continue;
    }
    seen.set(s.name, s.rel);
    for (const dir of TARGET_DIRS) links.push({ path: `${dir}/${s.name}`, target: posix.join('../..', '.factory', s.rel) });
  }
  return { links, problems };
}

export function linkState(abs) {
  try {
    const st = lstatSync(abs);
    return st.isSymbolicLink() ? { kind: 'link', target: readlinkSync(abs) } : { kind: 'real' };
  } catch {
    return { kind: 'missing' };
  }
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
