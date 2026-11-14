#!/usr/bin/env node
/**
 * Validates what the factory reads, so a script or workflow never trips over a malformed file mid-run.
 *
 *   node .factory/scripts/check.mjs
 *
 * - Every plan with frontmatter is one pull request: a Conventional Commit `title`, a known `status` and `kind`, `needs` / `builds-on` / `retires` that exist, `owns` and `proves` when ready or building, and `pr` when merged.
 * - `docs/roadmap.md` has an `updated` date and links only to files that exist.
 * - Every intake note has a title, a known `kind` and `status`, a `filed` date, and a `revisit` date when parked; every changelog entry has a title, a `date` and a `pr`.
 *
 * Skills, the pipeline, and the installed output are validated by `metafab check`, not here.
 */

import { existsSync } from 'node:fs';
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
  fileSource,
  listPlans,
  loadPlan,
  parseFrontmatter,
  parseRoadmap,
} from './lib.mjs';

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Plans
const source = fileSource();
const plans = new Map();
for (const rel of listPlans(source)) {
  const plan = loadPlan(source, rel);
  if (plan) plans.set(rel, plan);
}
const planNumbers = new Map();
for (const rel of plans.keys()) {
  const name = rel.split('/').pop();
  const match = /^([1-9]\d*\.\d{3})-[a-z0-9]+(-[a-z0-9]+)*\.md$/.exec(name);
  if (!match) {
    err(rel, 'plan files are named <round>.<NNN>-<slug>.md, such as 1.014-publish-dry-run.md');
    continue;
  }
  if (planNumbers.has(match[1])) err(rel, `plan number ${match[1]} is also used by ${planNumbers.get(match[1])}`);
  else planNumbers.set(match[1], rel);
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
console.log(`✓ factory check passed (${withFrontmatter} of ${plans.size} plans${roadmapText === undefined ? ', no roadmap yet' : ', roadmap'})`);
