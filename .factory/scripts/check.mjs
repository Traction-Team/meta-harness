#!/usr/bin/env node
/**
 * Validates what the factory reads, so a workflow or script never trips over a malformed file mid-run.
 *
 *   node .factory/scripts/check.mjs
 *
 * - `docs/factory.md` is present and every value is readable: a known key, set once, and no `<set me>` left. Its `plan-names`, `stacking` and `docs-changes` values are known.
 * - Every plan with frontmatter is one pull request: a Conventional Commit `title`, a known `status` and `kind`, a file name in the configured scheme, `needs` that exist, `owns` and `proves` from `building` on, and `pr` when merged. With `features` set, a plan code belongs to a feature that has a doc and matches the file name and title.
 * - The roadmap has an `updated` date, links only to files that exist, and holds no more open lines than `roadmap-max-lines` allows.
 * - Every feature doc has a title, a known status, a unique code and a file name that carries it.
 * - Every intake note has a title, a known `kind` and `status`, a `filed` date, and a `revisit` date when parked, and its links exist. A sightings folder belongs to a note and holds only `.md` sightings with a `seen` date.
 * - Every changelog entry has a title, a `date` and a `pr`.
 * - When `release` is `on`, `release-branch` differs from `trunk` and `release-guide` exists.
 *
 * Skills, the pipeline and the installed output are validated by the tool's own `check` command, not here.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  DATED_PLAN,
  DOCS_CHANGES,
  FEATURE_CODE,
  FEATURE_STATUSES,
  INTAKE_KINDS,
  INTAKE_STATUSES,
  NUMBERED_PLAN,
  PLAN_CODE,
  PLAN_KINDS,
  PLAN_NAMES,
  PLAN_STATUSES,
  PR_TITLE,
  RELEASE,
  ROOT,
  SETTINGS_FILE,
  STACKING,
  fileSource,
  isFactoryPlan,
  listFeatures,
  listPlans,
  loadFeature,
  loadPlan,
  parseFrontmatter,
  parseRoadmap,
  readSettings,
  repoPath,
} from './lib.mjs';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (value) => DATE.test(String(value ?? ''));

const settingsRead = readSettings(fileSource());
const settings = settingsRead.values;
const errors = [...settingsRead.errors];
const warnings = [...settingsRead.warnings];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

for (const [key, allowed] of [
  ['plan-names', PLAN_NAMES],
  ['stacking', STACKING],
  ['docs-changes', DOCS_CHANGES],
  ['release', RELEASE],
]) {
  if (!allowed.includes(settings[key])) err(SETTINGS_FILE, `setting "${key}" is "${settings[key]}", not one of ${allowed.join(' | ')}`);
}

const source = fileSource();

// Plans
const plans = new Map();
for (const rel of listPlans(source, settings)) {
  const plan = loadPlan(source, rel, settings);
  if (plan) plans.set(rel, plan);
}

const numbered = settings['plan-names'] === 'numbered';
const planNumbers = new Map();
for (const rel of plans.keys()) {
  const name = rel.split('/').pop();
  if (numbered) {
    const match = NUMBERED_PLAN.exec(name);
    if (!match) {
      err(rel, 'plan files are named <round>.<NNN>-<slug>.md, such as 1.014-publish-dry-run.md; set `plan-names` to dated to use YYYY-MM-DD-<slug>.md');
      continue;
    }
    if (planNumbers.has(match[1])) err(rel, `plan number ${match[1]} is also used by ${planNumbers.get(match[1])}`);
    else planNumbers.set(match[1], rel);
    continue;
  }
  const match = DATED_PLAN.exec(name);
  if (!match) {
    err(rel, 'plan files are named YYYY-MM-DD-<slug>.md, or YYYY-MM-DD-<code>-<n>-<slug>.md when `features` is set; set `plan-names` to numbered to use <round>.<NNN>-<slug>.md');
    continue;
  }
  const code = match[2] ? `${match[2].toUpperCase()}-${match[3]}` : undefined;
  if (code && !settings.features) err(rel, `the file name carries ${code}, but features is empty; a plan code needs a feature doc`);
}

const features = new Map();
for (const rel of listFeatures(source, settings)) {
  const feature = loadFeature(source, rel);
  const where = rel;
  if (!feature.hasFrontmatter) {
    err(where, 'no frontmatter; use .factory/templates/feature.md');
    continue;
  }
  if (!feature.title) err(where, "title is required: the feature's name");
  if (!FEATURE_STATUSES.includes(feature.status)) err(where, `status "${feature.status}" is not one of ${FEATURE_STATUSES.join(' | ')}`);
  if (!FEATURE_CODE.test(feature.code ?? '')) {
    err(where, `code "${feature.code ?? ''}" is not a feature code; use 2 to 5 capitals, e.g. ONB`);
    continue;
  }
  if (features.has(feature.code)) err(where, `code ${feature.code} is also the code of ${features.get(feature.code).path}`);
  else features.set(feature.code, feature);
  if (!feature.slug.startsWith(`${feature.code.toLowerCase()}-`)) err(where, `a feature doc is named <features>/${feature.code.toLowerCase()}-<slug>.md`);
  if (feature.data.priority !== undefined && !/^\d+$/.test(String(feature.data.priority).trim())) err(where, `priority "${feature.data.priority}" is not a number; it orders features, lowest first`);
}

const planCodes = new Map();
for (const plan of plans.values()) {
  if (!isFactoryPlan(plan)) continue;
  const { data } = plan;
  const where = plan.path;
  if (!plan.title) err(where, 'title is required: it is the pull request title');
  else if (!PR_TITLE.test(plan.title)) err(where, `title "${plan.title}" is not a pull request title; write "<feat|fix|refactor|docs|chore|test|ci|build>: <what becomes true>"`);
  if (!PLAN_STATUSES.includes(plan.status)) err(where, `status "${plan.status}" is not one of ${PLAN_STATUSES.join(' | ')}`);
  if (!PLAN_KINDS.includes(data.kind)) err(where, `kind "${data.kind ?? ''}" is not one of ${PLAN_KINDS.join(' | ')}`);

  const nameCode = numbered ? undefined : /^\d{4}-\d{2}-\d{2}-([a-z][a-z0-9]{0,4}-\d+)-/.exec(plan.slug)?.[1]?.toUpperCase();
  const titleCode = /^[a-z()0-9-]+: ([A-Z][A-Z0-9]{1,4}-\d+) /.exec(plan.title)?.[1];
  if (!settings.features) {
    if (plan.code !== undefined) err(where, `code "${plan.code}" is set, but features is empty; a plan code needs a feature doc`);
  } else if (plan.code !== undefined) {
    const match = PLAN_CODE.exec(plan.code);
    if (!match) err(where, `code "${plan.code}" is not a plan code; write <feature code>-<number>, e.g. ONB-3`);
    else {
      if (planCodes.has(plan.code)) err(where, `code ${plan.code} is also the code of ${planCodes.get(plan.code)}`);
      planCodes.set(plan.code, plan.path);
      if (!features.has(match[1])) err(where, `code ${plan.code} names feature ${match[1]}, which has no feature doc`);
    }
  }
  if (nameCode && nameCode !== plan.code) err(where, `the file name carries ${nameCode} but code is "${plan.code ?? ''}"`);
  if (titleCode && titleCode !== plan.code) err(where, `the title carries ${titleCode} but code is "${plan.code ?? ''}"`);

  if (['ready', 'building'].includes(plan.status)) {
    if (plan.owns.length === 0) err(where, 'owns is required: the paths this pull request may change');
    if (!plan.proves) err(where, 'proves is required: the command or check whose output goes in the pull request');
  }
  if (['merged', 'live'].includes(plan.status) && !plan.pr) err(where, `a ${plan.status} plan names its pr`);
  for (const need of plan.needs) {
    if (need === plan.path) err(where, 'needs itself');
    else if (!isFactoryPlan(plans.get(need))) err(where, `needs ${need}, which is not a plan with frontmatter`);
  }
  for (const ref of [data['builds-on'], data.retires].flat().filter(Boolean)) {
    if (typeof ref === 'string' && !existsSync(join(ROOT, ref))) err(where, `links to ${ref}, which does not exist`);
  }
}

// Roadmap
const roadmapText = source.read(settings.roadmap);
if (roadmapText !== undefined) {
  const { data, lines } = parseRoadmap(roadmapText, settings);
  if (!isDate(data.updated)) err(settings.roadmap, 'frontmatter "updated" is required, as YYYY-MM-DD');
  for (const line of lines) {
    for (const link of line.links) if (!existsSync(join(ROOT, link.path))) err(`${settings.roadmap}:${line.line}`, `links to ${link.path}, which does not exist`);
  }
  const open = lines.filter((line) => !line.done).length;
  const max = Number(settings['roadmap-max-lines']);
  if (Number.isInteger(max) && max > 0 && open > max) {
    err(settings.roadmap, `has ${open} open lines; it holds at most ${max}, so agree which wait with prioritise-roadmap`);
  }
}

// Intake and changelog
const isEntry = (file) => file.endsWith('.md') && !file.endsWith('/README.md');

for (const rel of source.list(repoPath(settings.intake)).filter(isEntry)) {
  const { data, hasFrontmatter } = parseFrontmatter(source.read(rel) ?? '');
  if (!hasFrontmatter) {
    err(rel, 'no frontmatter; use .factory/templates/intake.md');
    continue;
  }
  if (!data.title) err(rel, 'title is required');
  if (!INTAKE_KINDS.includes(data.kind)) err(rel, `kind "${data.kind ?? ''}" is not one of ${INTAKE_KINDS.join(' | ')}`);
  if (!INTAKE_STATUSES.includes(data.status)) err(rel, `status "${data.status ?? ''}" is not one of ${INTAKE_STATUSES.join(' | ')}`);
  if (!isDate(data.filed)) err(rel, 'filed is required, as YYYY-MM-DD');
  if (data.status === 'parked' && !isDate(data.revisit)) err(rel, 'a parked note needs a revisit date, as YYYY-MM-DD');
  for (const link of [data.links].flat().filter(Boolean)) {
    if (typeof link === 'string' && !existsSync(join(ROOT, link))) err(rel, `links to ${link}, which does not exist`);
  }
}

// A sightings folder sits beside the note it belongs to: `<intake>/<note stem>/`.
for (const dir of source.listDirs(repoPath(settings.intake))) {
  if (source.read(`${dir}.md`) === undefined) err(dir, `holds sightings of ${dir}.md, which does not exist; move them to the note they belong to, or delete the folder with the note`);
  for (const rel of source.list(dir)) {
    if (!rel.endsWith('.md')) {
      err(rel, 'a sightings folder holds only .md files from .factory/templates/intake-sighting.md');
      continue;
    }
    const { data, hasFrontmatter } = parseFrontmatter(source.read(rel) ?? '');
    if (!hasFrontmatter) err(rel, 'no frontmatter; use .factory/templates/intake-sighting.md');
    else if (!isDate(data.seen)) err(rel, 'seen is required, as YYYY-MM-DD');
  }
}

for (const rel of source.list(repoPath(settings.changelog)).filter(isEntry)) {
  const { data, hasFrontmatter } = parseFrontmatter(source.read(rel) ?? '');
  if (!hasFrontmatter) {
    err(rel, 'no frontmatter; use .factory/templates/changelog.md');
    continue;
  }
  if (!data.title) err(rel, 'title is required');
  if (!isDate(data.date)) err(rel, 'date is required, as YYYY-MM-DD');
  if (!data.pr) err(rel, 'pr is required');
}

// Release
if (settings.release === 'on') {
  if (settings['release-branch'] === settings.trunk) {
    err(SETTINGS_FILE, `release-branch is "${settings['release-branch']}", the same as trunk; a release branch must differ from trunk`);
  }
  if (!existsSync(join(ROOT, settings['release-guide']))) {
    err(SETTINGS_FILE, `release-guide ${settings['release-guide']} does not exist; write the guide the release workflow follows, or set release to off`);
  }
}

for (const w of warnings) console.error(`! ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  console.error(`\n${errors.length} problem(s).`);
  process.exit(1);
}
const withFrontmatter = [...plans.values()].filter(isFactoryPlan).length;
const featurePart = settings.features ? `, ${features.size} feature${features.size === 1 ? '' : 's'}` : '';
console.log(`✓ factory check passed (${withFrontmatter} of ${plans.size} plans${featurePart}${roadmapText === undefined ? ', no roadmap yet' : `, ${settings.roadmap}`})`);
