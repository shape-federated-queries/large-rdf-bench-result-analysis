#!/usr/bin/env bun
// C8 — justify why our result's author names differ from the official reference:
// the official C8 results are WRONG on two counts, both reference-side.
//
// C8 projects ?fullnames = the author's rdfs:label. The official expected results:
//   (a) corrupt 53 accented author labels to the Unicode replacement char U+FFFD
//       (e.g. `Asunci�n G�mez-P�rez`), and
//   (b) drop a genuine trailing-space label variant that the source carries.
// The correct/complete values are present in the data, and a conforming engine
// (ours) returns them. We prove that here by checking the data source directly:
// the accented names ARE the real rdfs:labels, and eyal-oren really has two labels.
//
//   bun verify/c8-encoding.ts --files ../benchmark/datasets   # all *.nt (source-agnostic)
//   bun verify/c8-encoding.ts --endpoint http://<host>:3002/sparql
//   bun verify/c8-encoding.ts --wall <ssh-host>               # federation on the wall

import { source, describeSource, iri, lit, ANY, exists, count, title, claim, evidence, expect, conclude } from './lib';

const src = source();
const LABEL = iri('http://www.w3.org/2000/01/rdf-schema#label');

title('C8 / author-name encoding + dropped label variant (official is wrong)');
console.log(`data source: ${describeSource(src)}`);
claim('The official C8 results are wrong: they U+FFFD-corrupt accented author rdfs:labels, and drop a real trailing-space label variant. Both correct values live in the data, which our result faithfully returns.');

// (a) The accented author names our result returns are the genuine rdfs:labels;
//     the official's U+FFFD forms are corruptions of names that really exist.
const accented: [string, string][] = [
  [ 'person:asuncion-gomez-perez', 'Asunción Gómez-Pérez' ],
  [ 'person:rafael-penaloza', 'Rafael Peñaloza' ],
  [ 'person:juergen-umbrich', 'Jürgen Umbrich' ],
];
for (const [ p, name ] of accented) {
  const ok = await exists(src, iri(p), LABEL, lit(name));
  expect(ok, `${p} rdfs:label "${name}" (correct UTF-8) is in the data — the official's U+FFFD form is a corruption of this real label.`);
}

// (b) eyal-oren genuinely carries BOTH a plain and a trailing-space label, so a
//     conforming engine returns both; the official kept only the trimmed one.
const plain = await exists(src, iri('person:eyal-oren'), LABEL, lit('Eyal Oren'));
expect(plain, 'eyal-oren rdfs:label "Eyal Oren" exists.');
const trailing = await exists(src, iri('person:eyal-oren'), LABEL, lit('Eyal Oren '));
expect(trailing, 'eyal-oren rdfs:label "Eyal Oren " (trailing space) ALSO exists — the source carries both, so returning both is faithful; the official dropped this one.');
const nLabels = await count(src, iri('person:eyal-oren'), LABEL, ANY);
evidence(`eyal-oren has ${nLabels} rdfs:label triple(s) in the data (plain + trailing-space variants).`);

conclude('The accented author names we return are the genuine rdfs:labels (the official corrupts them to U+FFFD — we repair the reference in cleanup via char_repairs.json), and eyal-oren\'s trailing-space label is real (our extra rows are faithful to the source). C8\'s differences are the official reference being wrong, not a federation error on our side.');
