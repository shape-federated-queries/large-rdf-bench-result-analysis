#!/usr/bin/env bun
// C7 — does the OPTIONAL data actually exist? C7's deficit is entirely in its
// cross-source OPTIONAL (`?place dbo:capital ?capital ; geo:lat ?lat ; geo:long ?long`):
// the mandatory part is complete (77/77 base rows), but the reference expands them to
// 112 rows while our engine yields fewer. This script checks, for every C7 place,
// whether the OPTIONAL edges exist in the data — so each difference can be classified:
//
//   * source HAS capital/geo, but we don't bind it   -> our engine is incomplete
//   * source LACKS it, yet the reference binds a value (e.g. the `'null'` sentinel)
//                                                       -> the reference is wrong
//
// Places are taken from no_opt_C7.srj (run c7-rerun.ts first to produce it), and each
// place's edges are checked against a data source you choose:
//   bun verify/c7-optional.ts --files ../benchmark/datasets
//   bun verify/c7-optional.ts --endpoint http://127.0.0.1:13003/sparql   # a DBpedia endpoint
//   bun verify/c7-optional.ts --wall <ssh-host>

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { source, describeSource, iri, ANY, exists, count } from './lib';

const src = source();
const CAPITAL = iri('dbo:capital');
const LAT = iri('geo:lat');
const LONG = iri('geo:long');

function places(file: string): string[] {
  const bs = JSON.parse(readFileSync(file, 'utf8')).results.bindings as Record<string, any>[];
  return [ ...new Set(bs.map(b => b.place?.value).filter(Boolean)) ];
}
function capitalBinding(file: string): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  const bs = JSON.parse(readFileSync(file, 'utf8')).results.bindings as Record<string, any>[];
  for (const b of bs) {
    const p = b.place?.value; const c = b.capital?.value;
    if (!p) continue;
    if (!m.has(p)) m.set(p, new Set());
    if (c) m.get(p)!.add(c);
  }
  return m;
}

const dir = import.meta.dir;
const pls = places(join(dir, 'no_opt_C7.srj'));
const refCap = capitalBinding(join(dir, '..', 'benchmark', 'results', 'C7.srj'));
let oursCap = new Map<string, Set<string>>();
try { oursCap = capitalBinding(join(dir, 'C7_union_partial.srj')); } catch { /* optional */ }

console.log(`\n=== C7 OPTIONAL existence check over ${describeSource(src)} ===`);
console.log(`${pls.length} distinct places from no_opt_C7.srj\n`);
console.log('place                                  src:cap(n) lat long | ref-binds     we-bind');
console.log('-'.repeat(96));

let incomplete = 0, refDefect = 0;
for (const p of pls.sort()) {
  const P = iri(p);
  const nCap = await count(src, P, CAPITAL, ANY);
  const hasLat = await exists(src, P, LAT, ANY);
  const hasLong = await exists(src, P, LONG, ANY);
  const ref = [ ...(refCap.get(p) ?? []) ];
  const ours = [ ...(oursCap.get(p) ?? []) ];
  const refReal = ref.filter(v => v !== "'null'" && v !== 'null');
  const refNull = ref.some(v => v === "'null'" || v === 'null');
  const short = (u: string) => u.replace(/^https?:\/\/dbpedia\.org\/resource\//u, 'dbr:');
  const refStr = refReal.length ? refReal.map(short).join(',') : (refNull ? "'null'" : '—');
  const oursStr = ours.length ? ours.map(short).join(',') : '—';
  // classification
  let flag = '';
  if (nCap > 0 && ours.length === 0) { flag = '  <- OUR ENGINE MISSES existing capital'; incomplete++; }
  else if (nCap === 0 && refReal.length > 0) { flag = '  <- REF binds a capital the data lacks'; refDefect++; }
  else if (nCap === 0 && refNull) { flag = "  <- REF 'null' sentinel; data has no capital (we correctly leave it unbound)"; refDefect++; }
  console.log(`${short(p).padEnd(38)} ${String(nCap).padStart(6)}   ${hasLat ? 'Y' : '·'}   ${hasLong ? 'Y' : '·'}  | ${refStr.padEnd(12)} ${oursStr}${flag}`);
}

console.log('-'.repeat(96));
console.log(`places where the data HAS a capital but we don't bind it (our incompleteness): ${incomplete}`);
console.log(`places where the reference binds a non-existent capital / 'null' sentinel (reference defect): ${refDefect}`);
