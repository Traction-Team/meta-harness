#!/usr/bin/env node
/**
 * Stand-in for `metafab build` until plan 04 lands. Installs the factory into this worktree:
 *
 *   node .factory/scripts/link.mjs
 *
 * - Links every skill under `.factory/` into `.claude/skills/<name>` and `.agents/skills/<name>` as a relative symlink, and removes links into `.factory/` whose skill is gone. A real directory with the same name is left alone with a warning.
 * - Writes the generated block in root `AGENTS.md` from `.factory/AGENTS.md` and the pipeline in `.factory/factory.yaml`, touching nothing outside the markers.
 *
 * The links and the block are committed, so a clone needs no setup. `check.mjs` fails when either is stale.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, TARGET_DIRS, applyBlock, desiredLinks, linkState } from './lib.mjs';

const changes = [];
const { links, problems } = desiredLinks();
for (const p of problems) console.warn(`! ${p}`);

const wanted = new Set(links.map((l) => l.path));
for (const { path, target } of links) {
  const abs = join(ROOT, path);
  const state = linkState(abs);
  if (state.kind === 'real' || (state.kind === 'link' && !state.target.includes('.factory/'))) {
    console.warn(`! ${path} already exists and is not a factory link; left alone`);
    continue;
  }
  if (state.kind === 'link' && state.target === target) continue;
  mkdirSync(join(ROOT, path, '..'), { recursive: true });
  if (state.kind === 'link') rmSync(abs);
  symlinkSync(target, abs, 'dir');
  changes.push(`link ${path} -> ${target}`);
}

for (const dir of TARGET_DIRS) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) continue;
  for (const name of readdirSync(abs)) {
    const path = `${dir}/${name}`;
    const state = linkState(join(abs, name));
    if (state.kind !== 'link' || !state.target.includes('.factory/') || wanted.has(path)) continue;
    rmSync(join(abs, name));
    changes.push(`unlink ${path}`);
  }
}

const agentsFile = join(ROOT, 'AGENTS.md');
const current = existsSync(agentsFile) ? readFileSync(agentsFile, 'utf8') : undefined;
const next = applyBlock(current);
if (next !== current) {
  writeFileSync(agentsFile, next);
  changes.push(current === undefined ? 'create AGENTS.md' : 'update the factory block in AGENTS.md');
}

for (const c of changes) console.log(`  ${c}`);
console.log(changes.length ? `✓ factory installed (${changes.length} change${changes.length === 1 ? '' : 's'}). Restart open agent sessions.` : '✓ factory up to date');
