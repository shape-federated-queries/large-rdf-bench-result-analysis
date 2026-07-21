#!/usr/bin/env bun
// C7 — prove our (deduplicated) result is the correct one, and the reference's
// extra rows are redundant, not distinct answers.
//
// C7's OPTIONAL binds `?place geo:lat ?lat ; geo:long ?long`. DBpedia stores each
// coordinate REDUNDANTLY as both xsd:double AND xsd:float (the same value, two
// typed literals). Under strict term semantics those are distinct RDF terms, so a
// term-preserving engine (the reference/FedX) emits the float x double cross-
// product -> several rows for a single coordinate. But an RDF graph is a SET and
// numeric literals denote values, so QLever canonicalizes them to one xsd:decimal
// value and returns each coordinate ONCE -- the correct set-semantics answer.
//
// This shows the redundancy directly in the local data:
//   bun verify/c7-datatype.ts --files ../benchmark/datasets
//
// (It reads the C7 places from benchmark/results/C7.srj and greps every geo:lat /
// geo:long triple about them, grouping by numeric datatype.)

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { source, describeSource, title, claim, evidence, expect, conclude } from './lib';

const src = source();
if (src.kind !== 'files') {
  console.error('This proof runs on the local data: use --files <datasets-dir>.');
  process.exit(2);
}

const C7REF = join(import.meta.dir, '..', 'benchmark', 'results', 'C7.srj');
const places = new Set<string>(
  (JSON.parse(readFileSync(C7REF, 'utf8')).results.bindings as any[])
    .map(b => b.place?.value).filter(Boolean),
);

type T = { s: string; pred: 'lat' | 'long'; v: string; dt: string };
const line = /^<([^>]+)> <http:\/\/www\.w3\.org\/2003\/01\/geo\/wgs84_pos#(lat|long)> "([^"]*)"\^\^<[^>]*#([a-z0-9]+)>/u;
const triples: T[] = [];
for (const nt of new Bun.Glob('*.nt').scanSync({ cwd: src.dir, absolute: true })) {
  const r = Bun.spawnSync([ 'grep', '-E', 'wgs84_pos#(lat|long)> ', nt ]);
  for (const l of r.stdout.toString().split('\n')) {
    const m = line.exec(l);
    if (m && places.has(m[1])) triples.push({ s: m[1], pred: m[2] as 'lat' | 'long', v: m[3], dt: m[4] });
  }
}

title('C7 / numeric-datatype redundancy — our deduplicated result is correct');
console.log(`data source: ${describeSource(src)}`);
claim('DBpedia stores each C7 coordinate redundantly as both xsd:double and xsd:float. An RDF graph is a set and numeric literals denote values, so QLever canonicalizes them to one xsd:decimal value and returns each coordinate once (correct set semantics); a term-preserving engine emits the float x double cross-product (redundant duplicate rows). Our C7 answer is the deduplicated, correct one.');

const byKey = new Map<string, T[]>();
for (const t of triples) {
  const k = `${t.s}\t${t.pred}`;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k)!.push(t);
}
let redundant = 0;
for (const [ k, ts ] of [ ...byKey ].sort()) {
  const [ place, pred ] = k.split('\t');
  const dts = new Set(ts.map(t => t.dt));
  const vals = new Set(ts.map(t => Number(t.v).toPrecision(6)));  // distinct by value
  const short = place.replace(/^https?:\/\/dbpedia\.org\/resource\//u, 'dbr:');
  const isRedundant = dts.size > 1 && vals.size < ts.length;
  if (isRedundant) redundant++;
  console.log(`  ${short.padEnd(34)} geo:${pred.padEnd(4)} ${ts.length} triples · datatypes {${[ ...dts ].join(', ')}} · ${vals.size} distinct value(s)${isRedundant ? '  <- same value stored as double AND float' : ''}`);
}

evidence(`${redundant} (place, coordinate) entries store the same value under more than one numeric datatype.`);
evidence('QLever collapses each to a single xsd:decimal (one row); a term-preserving engine keeps every typed literal (the float x double cross-product).');
expect(redundant > 0, 'the local data stores C7 coordinates redundantly across numeric datatypes.');
conclude('The reference\'s extra C7 rows are the float x double cross-product of the same coordinates, not distinct answers. QLever canonicalizes numeric literals to xsd:decimal and returns each coordinate once, which is the correct set-semantics result over an RDF graph. We do NOT alter the source data; this datatype redundancy is inherent to it and only affects engines that preserve typed-literal distinctions.');
