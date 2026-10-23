#!/usr/bin/env node
/**
 * Validates what the factory reads, so a script or workflow never trips over a malformed file mid-run.
 *
 *   node .factory/scripts/check.mjs
 *
 * - Every skill's frontmatter `name` matches its folder, it has a one-line `description`, and names are unique and lowercase-hyphenated.
 * - Every pipeline entry in `.factory/factory.yaml` names a workflow, at most once.
 * - The skill links in `.claude/skills/` and `.agents/skills/` and the root `AGENTS.md` block match what `link.mjs` writes.
 * - Every plan with frontmatter is one pull request: a Conventional Commit `title`, a known `status` and `kind`, `needs` / `builds-on` / `retires` that exist, `owns` and `proves` when ready or building, and `pr` when merged.
 * - `docs/roadmap.md` has an `updated` date and links only to files that exist.
 * - Every intake note has a title, a known `kind` and `status`, a `filed` date, and a `revisit` date when parked; every changelog entry has a title, a `date` and a `pr`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHANGELOG_DIR,
  INTAKE_DIR,
  INTAKE_KINDS,
  INTAKE_STATUSES,
  PLAN_KINDS,
  PLAN_STATUSES,
  PR_TITLE,
  ROADMAP_FILE,
  ROOT,
  applyBlock,
  desiredLinks,
  fileSource,
  linkState,
  listPlans,
  listSkills,
  loadPlan,
  parseFrontmatter,
  parseRoadmap,
  readPipeline,
} from './lib.mjs';

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Skills
const skills = listSkills();
for (const s of skills) {
  const where = `.factory/${s.rel}/SKILL.md`;
  if (!s.hasFrontmatter) err(where, 'no frontmatter');
  if (s.data.name !== s.name) err(where, `name is "${s.data.name ?? ''}", expected "${s.name}"`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.name)) err(where, 'skill names use lowercase letters, digits and single hyphens');
  if (!s.data.description) err(where, 'description is required');
  else if (typeof s.data.description !== 'string' || s.data.description.includes('\n')) err(where, 'description must be one line');
}
const links = desiredLinks(skills);
for (const p of links.problems) err('.factory', p);

// Pipeline
const workflows = new Set(skills.filter((s) => s.isWorkflow).map((s) => s.name));
const seenInPipeline = new Set();
for (const e of readPipeline()) {
  const where = `.factory/factory.yaml:${e.line}`;
  if (!e.workflow) err(where, `cannot read pipeline entry "${e.raw}"; write "- name" or "- name: { stop: text }"`);
  else if (!workflows.has(e.workflow)) err(where, `names workflow "${e.workflow}", which is not in .factory/workflows/`);
  else if (seenInPipeline.has(e.workflow)) err(where, `"${e.workflow}" appears twice`);
  if (e.workflow) seenInPipeline.add(e.workflow);
}

// Installed links and the AGENTS.md block
for (const { path, target } of links.links) {
  const state = linkState(join(ROOT, path));
  if (state.kind !== 'link' || state.target !== target) err(path, `should link to ${target}. Run node .factory/scripts/link.mjs`);
}
const agents = existsSync(join(ROOT, 'AGENTS.md')) ? readFileSync(join(ROOT, 'AGENTS.md'), 'utf8') : undefined;
if (agents === undefined || applyBlock(agents) !== agents) err('AGENTS.md', 'the factory block is missing or stale. Run node .factory/scripts/link.mjs');

// Plans
const source = fileSource();
const plans = new Map();
for (const rel of listPlans(source)) {
  const plan = loadPlan(source, rel);
  if (plan) plans.set(rel, plan);
}
for (const plan of plans.values()) {
  if (!plan.hasFrontmatter) continue;
  const { data } = plan;
  const where = plan.path;
  if (!plan.title) err(where, 'title is required: it is the PR title');
  else if (!PR_TITLE.test(plan.title)) err(where, `title "${plan.title}" is not a PR title; write "<feat|fix|refactor|docs|chore|test|ci|build>: <what becomes true>"`);
  if (!PLAN_STATUSES.includes(plan.status)) err(where, `status "${plan.status}" is not one of ${PLAN_STATUSES.join(' | ')}`);
  if (!PLAN_KINDS.includes(data.kind)) err(where, `kind "${data.kind ?? ''}" is not one of ${PLAN_KINDS.join(' | ')}`);
  if (['ready', 'building'].includes(plan.status)) {
    if (plan.owns.length === 0) err(where, 'owns is required: the paths this PR may change');
    if (!plan.proves) err(where, 'proves is required: the command whose output goes in the PR');
  }
  if (plan.status === 'merged' && !plan.pr) err(where, 'a merged plan names its pr');
  for (const need of plan.needs) {
    if (need === plan.path) err(where, 'needs itself');
    else if (!plans.get(need)?.hasFrontmatter) err(where, `needs ${need}, which is not a plan with frontmatter`);
  }
  for (const ref of [data['builds-on'], data.retires].flat().filter(Boolean)) {
    if (typeof ref === 'string' && !existsSync(join(ROOT, ref))) err(where, `links to ${ref}, which does not exist`);
  }
}

// Roadmap
const roadmapText = source.read(ROADMAP_FILE);
if (roadmapText !== undefined) {
  const { data, lines } = parseRoadmap(roadmapText);
  if (!DATE.test(String(data.updated ?? ''))) err(ROADMAP_FILE, 'frontmatter "updated" is required, as YYYY-MM-DD');
  for (const l of lines) {
    for (const link of l.links) if (!existsSync(join(ROOT, link))) err(`${ROADMAP_FILE}:${l.line}`, `links to ${link}, which does not exist`);
  }
}

// Intake and changelog
const isEntry = (f) => f.endsWith('.md') && !f.endsWith('/README.md');
for (const rel of source.list(INTAKE_DIR).filter(isEntry)) {
  const { data, hasFrontmatter } = parseFrontmatter(source.read(rel) ?? '');
  if (!hasFrontmatter) {
    err(rel, 'no frontmatter; use .factory/templates/intake.md');
    continue;
  }
  if (!data.title) err(rel, 'title is required');
  if (!INTAKE_KINDS.includes(data.kind)) err(rel, `kind "${data.kind ?? ''}" is not one of ${INTAKE_KINDS.join(' | ')}`);
  if (!INTAKE_STATUSES.includes(data.status)) err(rel, `status "${data.status ?? ''}" is not one of ${INTAKE_STATUSES.join(' | ')}`);
  if (!DATE.test(String(data.filed ?? ''))) err(rel, 'filed is required, as YYYY-MM-DD');
  if (data.status === 'parked' && !DATE.test(String(data.revisit ?? ''))) err(rel, 'a parked note needs a revisit date, as YYYY-MM-DD');
  for (const link of [data.links].flat().filter(Boolean)) {
    if (typeof link === 'string' && !existsSync(join(ROOT, link))) err(rel, `links to ${link}, which does not exist`);
  }
}
for (const rel of source.list(CHANGELOG_DIR).filter(isEntry)) {
  const { data, hasFrontmatter } = parseFrontmatter(source.read(rel) ?? '');
  if (!hasFrontmatter) {
    err(rel, 'no frontmatter; use .factory/templates/changelog.md');
    continue;
  }
  if (!data.title) err(rel, 'title is required');
  if (!DATE.test(String(data.date ?? ''))) err(rel, 'date is required, as YYYY-MM-DD');
  if (!data.pr) err(rel, 'pr is required');
}

if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  console.error(`\n${errors.length} problem(s).`);
  process.exit(1);
}
const withFrontmatter = [...plans.values()].filter((p) => p.hasFrontmatter).length;
console.log(`✓ factory check passed (${skills.length} skills, ${withFrontmatter} of ${plans.size} plans${roadmapText === undefined ? ', no roadmap yet' : ', roadmap'})`);
