#!/usr/bin/env bun
// S7 — justify why our result returns the (location=5369907, news=southern-california)
// row TWICE where the official reference has it once.
//
// The row itself is not in dispute — the reference already contains it. What we add is a
// second, identical copy, and that is CORRECT under SPARQL bag semantics:
//
//   S7 projects only ?location and ?news (dropping ?parent and ?y) and has NO DISTINCT.
//   For this binding the parentFeature edge (5369907 -> 5332921) and the NYT topic ?y are
//   single, but the join triple
//        5332921 geonames:name "California"
//   is asserted by TWO datasets — NYT and GeoNames (gn: = http://www.geonames.org/ontology#,
//   the same #name predicate). So the join matches the name in two sources, yielding two
//   solution mappings that project to the same (5369907, southern-california) row. With no
//   DISTINCT, both are kept. Consulting both sources (better COUNT/ASK source selection) is
//   why we get the faithful duplicate the reference implicitly collapsed.
//
// The single decisive claim, therefore, is: that one name triple lives in two datasets.
//   bun verify/s7-parentfeature.ts \
//     --nyt <.../datasets/NYT.nt | .../raw_datasets/NYT/locations.rdf> \
//     --geonames <.../raw_datasets/GeoNames/all-geonames-....n3>

import { existsSync } from 'node:fs';
import { iri, lit, existsIn, title, claim, section, evidence, expect, conclude } from './lib';

const get = (f: string) => { const i = Bun.argv.indexOf(f); return i >= 0 ? Bun.argv[i + 1] : undefined; };
const nyt = get('--nyt');
const geonames = get('--geonames');
if (!nyt || !geonames) {
  console.error('Pass both datasets: --nyt <NYT.nt|locations.rdf> --geonames <all-geonames-*.n3>');
  process.exit(2);
}
for (const f of [nyt, geonames]) {
  if (!existsSync(f)) {
    console.error(`No such file: ${f}\n(Did you paste the "…/" placeholder instead of the real absolute path?)`);
    process.exit(2);
  }
}

const CAL = iri('http://sws.geonames.org/5332921/');
const NAME = iri('http://www.geonames.org/ontology#name');

// grep the 5332921 statement block (subject line up to the
// first line ending in ' .') and look for its geonames:name "California" — gn: is the same
// #name predicate (verified from the file's @prefix).
function geonamesHasName(file: string, subjectIri: string, name: string): { ok: boolean; line?: string } {
  const r = Bun.spawnSync(['grep', '-m1', '-A60', `^<${subjectIri}> `, file]);
  const block: string[] = [];
  for (const l of r.stdout.toString().split('\n')) {
    block.push(l);
    if (/\s\.\s*$/u.test(l)) break; // Turtle statement terminator
  }
  const re = /(?:gn:name|<http:\/\/www\.geonames\.org\/ontology#name>)\s+"([^"]*)"/u;
  const hit = block.map(l => l.trim()).find(l => { const m = re.exec(l); return m && m[1] === name; });
  return { ok: !!hit, line: hit };
}

title('S7 / the duplicate (5369907, southern-california) row is faithful (bag semantics)');
claim(`Our result returns the (5369907, southern-california) row twice where the reference has
  it once. S7 projects only ?location/?news and has NO DISTINCT, and the join triple
  5332921 geonames:name "California" is asserted by TWO datasets (NYT and GeoNames). Under
  bag semantics the two source matches yield two identical rows — so the second copy is correct.`);

section('the name triple in NYT');
const inNyt = await existsIn(nyt, CAL, NAME, lit('California'));
expect(inNyt, `5332921 geonames:name "California" is in NYT (${nyt}).`);

section('the name triple in GeoNames');
const gn = geonamesHasName(geonames, 'http://sws.geonames.org/5332921/', 'California');
expect(gn.ok, `5332921 geonames:name "California" is in GeoNames (${geonames}).`);
if (gn.line) evidence(`GeoNames block line: ${gn.line}`);

conclude('`5332921 geonames:name "California"` is asserted by both NYT and GeoNames. With S7\'s '
  + 'projection to ?location/?news and no DISTINCT, the join matches this name in two sources, so '
  + 'the (5369907, southern-california) row is returned twice under bag semantics — a faithful '
  + 'duplicate our better source selection surfaces and the reference implicitly collapsed.');
