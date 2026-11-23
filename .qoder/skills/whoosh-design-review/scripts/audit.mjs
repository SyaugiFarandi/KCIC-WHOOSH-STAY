#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const target = process.argv[2] ?? 'apps/web/src';
const hallmarkDir =
  process.env.HALLMARK_SKILL_DIR ?? 'C:/Users/muhammad.farandi/.qoder/skills/hallmark';
const lint = path.join(hallmarkDir, 'scripts', 'sloplint.mjs');

if (!existsSync(lint)) {
  console.error(`sloplint not found at ${lint}`);
  process.exit(2);
}

const run = spawnSync(
  process.execPath,
  [lint, target, '--scope', 'app', '--genre', 'modern-minimal', '--json'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);

let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error('sloplint did not return JSON');
  console.error((run.stderr ?? '').slice(0, 2000));
  process.exit(2);
}

const findings = report.findings ?? [];
const tierRank = { floor: 0, reflex: 1, finish: 2 };
const byTier = {};
const byGate = {};
for (const f of findings) {
  byTier[f.tier] = (byTier[f.tier] ?? 0) + 1;
  const key = `${f.gate} ${f.grade}`;
  byGate[key] = (byGate[key] ?? 0) + 1;
}

console.log(`Hallmark sloplint (app scope) — ${target}`);
console.log(
  `total ${findings.length}: ` +
    Object.entries(byTier)
      .map(([tier, n]) => `${tier} ${n}`)
      .join(' · '),
);
console.log('');
for (const [key, n] of Object.entries(byGate).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key} x${n}`);
}

const grouped = {};
for (const f of findings) {
  const key = `${f.tier} · ${f.gate} ${f.grade}`;
  (grouped[key] ??= []).push(f);
}
const sortedKeys = Object.keys(grouped).sort(
  (a, b) =>
    tierRank[a.split(' · ')[0]] - tierRank[b.split(' · ')[0]] ||
    grouped[b].length - grouped[a].length,
);

console.log('');
for (const key of sortedKeys) {
  console.log(`## ${key} (${grouped[key].length})`);
  for (const f of grouped[key]) {
    const where = `${f.file}:${f.line}`;
    console.log(`- ${where} — ${f.evidence.replace(/\s+/g, ' ').slice(0, 150)}`);
    if (f.fix) console.log(`  fix: ${f.fix.slice(0, 150)}`);
  }
  console.log('');
}

console.log('Waived-on-record gates (see SKILL.md §4): 19 29 49 54 63 67 74 28a-below-fold 10a/sidebar width.');
process.exit(0);
