#!/usr/bin/env bun
// C7 — justify why our C7 coordinate values differ from the official reference.
//
// DBpedia carries the C7 place coordinates under MIXED numeric datatypes: some geo:lat /
// geo:long triples are typed xsd:double, others xsd:float (they come from different DBpedia
// source files — e.g. geo_coordinates_en.nt vs out0.nt). QLever casts all numeric literals
// to xsd:decimal, so our C7 result reports the coordinates as decimal while the reference
// keeps the original double/float typed literals. The C7 difference is therefore QLever's
// datatype canonicalization, NOT a wrong value.
//
//   bun verify/c7-datatype.ts \
//     --clean <.../datasets/DBPedia-Subset.nt> \
//     --raw   <.../raw_datasets/DBPedia-Subset>

import { existsSync } from 'node:fs';
import { title, claim, section, evidence, expect, conclude } from './lib';

const get = (f: string) => { const i = Bun.argv.indexOf(f); return i >= 0 ? Bun.argv[i + 1] : undefined; };
const clean = get('--clean');
const raw = get('--raw');
if (!clean && !raw) { console.error('Pass DBpedia data: --clean <DBPedia-Subset.nt> and/or --raw <DBPedia-Subset dir>'); process.exit(2); }
for (const p of [clean, raw]) if (p && !existsSync(p)) { console.error(`No such path: ${p}`); process.exit(2); }

const DOUBLE = 'http://www.w3.org/2001/XMLSchema#double';
const FLOAT = 'http://www.w3.org/2001/XMLSchema#float';
const PLACE = 'http://dbpedia.org/resource/Greece'; // a C7 place

// Is there a geo:lat triple for `place` typed with `dtIri`? (grep works on the .nt file or
// recursively over the raw DBpedia directory.)
function latWithDatatype(path: string, place: string, dtIri: string): { ok: boolean; sample?: string } {
  const pat = `<${place}> <http://www.w3.org/2003/01/geo/wgs84_pos#lat> "[^"]*"\\^\\^<${dtIri}>`;
  const r = Bun.spawnSync(['grep', '-rEm1', pat, path]);
  return { ok: r.exitCode === 0, sample: r.stdout.toString().split('\n')[0].trim() || undefined };
}

title('C7 / DBpedia coordinates use mixed datatypes; QLever casts them to xsd:decimal');
claim('DBpedia carries the C7 place coordinates under mixed numeric datatypes — some geo:lat/'
  + 'geo:long are xsd:double, others xsd:float. QLever casts all numeric literals to xsd:decimal, '
  + 'so our C7 coordinates come out as decimal and differ from the reference\'s double/float '
  + 'literals. This proof just shows the mixed datatypes in the data.');

function proof(label: string, path: string) {
  section(`${label} (${path})`);
  const d = latWithDatatype(path, PLACE, DOUBLE);
  expect(d.ok, 'Greece geo:lat is present as xsd:double.');
  if (d.sample) evidence(d.sample);
  const f = latWithDatatype(path, PLACE, FLOAT);
  expect(f.ok, 'Greece geo:lat is present as xsd:float.');
  if (f.sample) {
    evidence(f.sample);
  }
}

if (clean) proof('cleaned DBPedia-Subset.nt', clean);
if (raw) proof('raw DBpedia source', raw);

conclude('DBpedia carries the coordinates under both xsd:double and xsd:float (shown above). '
  + 'QLever casts all numeric literals to xsd:decimal, which is why our C7 coordinate terms come '
  + 'out as decimal and differ from the reference\'s double/float literals — a QLever '
  + 'datatype-canonicalization effect.');
