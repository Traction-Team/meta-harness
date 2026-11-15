#!/usr/bin/env node
/**
 * Merges a stacked pull request and every unmerged pull request below it, bottom first, bypassing the review rules for someone allowed to bypass them (a code owner merging their own stack).
 *
 *   node .factory/scripts/merge-stack.mjs 1800             # merge #1800 and everything below it
 *   node .factory/scripts/merge-stack.mjs 1800 --dry-run   # list what would merge, in order, and stop
 *
 * It refuses to run while `stacking` is `off` in docs/factory.md, because a repository without stacked pull requests has nothing to merge this way.
 *
 * The host's stack merge box shows no bypass, and `gh pr merge --admin` is refused for a pull request in a stack. The asynchronous merge API takes `bypass_rules`, but only for the bottom unmerged pull request of a stack, so a whole stack cannot land in one call. This script merges them one at a time: it squash-merges the bottom one, waits until the host has retargeted the next one to the trunk, and merges that, until the named pull request has merged.
 *
 * It refuses to start when any pull request in the chain is a draft or has a check that is failing or still running, because the bypass skips required checks as well as reviews. It does not wait for checks to run again after each retarget: the code it merges is the code those checks passed on. It never runs for anyone without bypass rights; the host refuses the first merge and the script stops.
 */

import { execFileSync } from 'node:child_process';
import { ROOT, fileSource, readSettings } from './lib.mjs';

const settings = readSettings(fileSource()).values;
if (settings.stacking !== 'on') {
  console.error('merge-stack: stacking is off in docs/factory.md, so there are no stacked pull requests to merge; set `stacking` to on to use it');
  process.exit(1);
}
const trunk = settings.trunk;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const top = Number(args.find((a) => !a.startsWith('--')));
if (!Number.isInteger(top) || top <= 0) {
  console.error('usage: node .factory/scripts/merge-stack.mjs <top pull request number> [--dry-run]');
  process.exit(1);
}

function gh(ghArgs) {
  return execFileSync('gh', ghArgs, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function ghJson(ghArgs) {
  return JSON.parse(gh(ghArgs));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FIELDS = 'number,title,state,isDraft,baseRefName,headRefName,statusCheckRollup';
const OK_CHECK = ['SUCCESS', 'SKIPPED', 'NEUTRAL'];

/** The named pull request and each one below it, followed down base branches to the trunk, bottom first. */
function chain(number) {
  const prs = [];
  let pr = ghJson(['pr', 'view', String(number), '--json', FIELDS]);
  for (;;) {
    if (pr.state !== 'OPEN') throw new Error(`#${pr.number} is ${pr.state.toLowerCase()}, not open`);
    prs.unshift(pr);
    if (pr.baseRefName === trunk) return prs;
    const below = ghJson(['pr', 'list', '--head', pr.baseRefName, '--state', 'open', '--json', FIELDS]);
    if (below.length !== 1) throw new Error(`#${pr.number} is based on ${pr.baseRefName}, which has ${below.length} open pull requests, not one`);
    pr = below[0];
  }
}

/** Why a pull request is not safe to merge without its checks, or undefined when it is. */
function problem(pr) {
  if (pr.isDraft) return 'is a draft';
  const bad = (pr.statusCheckRollup ?? []).filter((c) => (c.__typename === 'StatusContext' ? c.state !== 'SUCCESS' : !OK_CHECK.includes(c.conclusion ?? '')));
  if (bad.length) return `has checks not passed: ${bad.map((c) => `${c.name ?? c.context} (${(c.conclusion || c.status || c.state || '').toLowerCase()})`).join(', ')}`;
  return undefined;
}

async function waitFor(what, test, { every = 5000, tries = 60 } = {}) {
  for (let i = 0; i < tries; i++) {
    const value = test();
    if (value) return value;
    await sleep(every);
  }
  throw new Error(`gave up waiting for ${what}`);
}

async function merge(pr) {
  await waitFor(`#${pr.number} to be retargeted to ${trunk}`, () => ghJson(['pr', 'view', String(pr.number), '--json', 'baseRefName']).baseRefName === trunk);
  let started;
  try {
    started = ghJson(['api', '-X', 'PUT', `repos/{owner}/{repo}/pulls/${pr.number}/merge-async`, '-f', 'merge_method=squash', '-f', 'merge_action=direct_merge', '-F', 'bypass_rules=true']);
  } catch (e) {
    // gh exits non-zero on a 4xx but still prints the host's JSON reply, which says why.
    started = JSON.parse(e.stdout || '{}');
  }
  if (started.status === 'merged') return;
  if (started.status !== 'pending') throw new Error(`#${pr.number} was not merged: ${started.details?.message ?? JSON.stringify(started)}`);
  const result = await waitFor(`#${pr.number} to merge`, () => {
    const r = ghJson(['api', `repos/{owner}/{repo}/pulls/${pr.number}/merge-async/${started.details.uuid}`]);
    return r.status === 'pending' ? undefined : r;
  });
  if (result.status !== 'merged') throw new Error(`#${pr.number} was not merged: ${result.details?.message ?? result.status}`);
}

let prs;
try {
  prs = chain(top);
} catch (e) {
  console.error(`merge-stack: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

console.log(`Merges into ${trunk}, bottom first:`);
for (const pr of prs) console.log(`  #${pr.number} ${pr.title}`);

const problems = prs.flatMap((pr) => {
  const p = problem(pr);
  return p ? [`#${pr.number} ${p}`] : [];
});
if (problems.length) {
  console.error(`\nmerge-stack: not merging (the bypass skips required checks too, so every pull request must be ready and passing first):\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
if (dryRun) process.exit(0);

for (const pr of prs) {
  try {
    await merge(pr);
    console.log(`merged #${pr.number}`);
  } catch (e) {
    console.error(`merge-stack: ${e instanceof Error ? e.message : String(e)}`);
    console.error('Stopped. The pull requests above this one are merged; the rest are untouched.');
    process.exit(1);
  }
}
console.log(`\nDone: ${prs.length} pull request${prs.length === 1 ? '' : 's'} merged into ${trunk}.`);
