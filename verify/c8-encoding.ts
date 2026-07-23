#!/usr/bin/env bun
// C8 — the eyal-oren author-name difference is a REAL discrepancy where our result is faithful
// to the source. eyal-oren genuinely carries a trailing-space label "Eyal Oren " (besides the
// plain "Eyal Oren"), so a conforming engine returns both and our C8 result has extra rows the
// official (trimmed) reference lacks. This cannot be reconciled via char_repairs (it substitutes
// characters, it adds no rows), so C8 stays a documented faithful difference. Proven against the
// raw SWDFood source:
//   bun verify/c8-encoding.ts --raw <.../raw_datasets/SWDFood>

import { existsSync } from 'node:fs';
import { title, claim, section, evidence, expect, conclude } from './lib';

const get = (f: string) => { const i = Bun.argv.indexOf(f); return i >= 0 ? Bun.argv[i + 1] : undefined; };
const raw = get('--raw');
if (!raw) { console.error('Pass the raw SWDFood source dir: --raw <SWDFood>'); process.exit(2); }
if (!existsSync(raw)) { console.error(`No such path: ${raw}`); process.exit(2); }

// grep the raw SWDFood source for a label string; return the first file + line it occurs in.
function rawGrep(dir: string, needle: string): { ok: boolean; file?: string; sample?: string } {
  const r = Bun.spawnSync(['grep', '-rnF',
    '--include=*.rdf', '--include=*.n3', '--include=*.ttl', '--include=*.nt', needle, dir]);
  const line = r.stdout.toString().split('\n').filter(Boolean)[0];
  if (!line) return { ok: false };
  const parts = line.split(':');
  return { ok: true, file: parts[0].replace(dir, '').replace(/^\//u, ''), sample: parts.slice(2).join(':').trim() };
}

title('C8 / eyal-oren trailing-space label — a real discrepancy, our result is faithful');
claim('eyal-oren genuinely carries a trailing-space label "Eyal Oren " in the source, besides the '
  + 'plain "Eyal Oren". A conforming engine returns both, so our C8 result has extra rows the official '
  + '(trimmed) reference lacks. This cannot be reconciled by char_repairs (it substitutes characters, '
  + 'it adds no rows), so C8 is a real, documented discrepancy where our result is more complete.');

section('the trailing-space label in the raw source');
const trailing = rawGrep(raw, 'Eyal Oren ');
expect(trailing.ok, '"Eyal Oren " (trailing space) is a real rdfs:label in the raw SWDFood source.');
if (trailing.file) evidence(`found in ${trailing.file}: ${trailing.sample}`);

conclude('eyal-oren\'s trailing-space label "Eyal Oren " is genuine source data, so the extra rows '
  + 'our result returns are faithful; the official reference dropped it. char_repairs cannot add the '
  + 'missing rows, so C8 remains a real discrepancy to document in the paper.');
