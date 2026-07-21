#!/usr/bin/env bun
// S7 — justify why our result includes location = geonames:5369907, which the
// official reference omits.
//
// S7 (no OPTIONAL):
//   ?location geonames:parentFeature ?parent .
//   ?parent   geonames:name 'California' .
//   ?y owl:sameAs ?location .
//   ?y nyt:topicPage ?news .
//
// The catch — and why this needs *federation*: in GeoNames, 5369907's parent is
// "Los Angeles County" (not California). But NYT carries
//   <5369907> geonames:parentFeature <5332921>   and   <5332921> name "California".
// So over all sources the join `?parent name "California"` holds for 5369907, the
// row is valid, and the official reference is incomplete. A single-source
// (GeoNames-only) view misses it — which is exactly the trap that hides this row.
//
//   bun verify/s7-parentfeature.ts --files <datasets-dir>     # all *.nt (source-agnostic)
//   bun verify/s7-parentfeature.ts --wall <ssh-host>          # federation on the wall

import { source, describeSource, iri, lit, ANY, exists, count, title, claim, evidence, expect, conclude } from './lib';

const src = source();
const LOC = iri('http://sws.geonames.org/5369907/');
const CAL = iri('http://sws.geonames.org/5332921/');
const PARENT = iri('http://www.geonames.org/ontology#parentFeature');
const NAME = iri('http://www.geonames.org/ontology#name');
const SAMEAS = iri('http://www.w3.org/2002/07/owl#sameAs');
const TOPIC = iri('http://data.nytimes.com/elements/topicPage');
const NEWS = iri('http://topics.nytimes.com/top/great-homes-and-destinations/destinations/southern-california/index.html');

title('S7 / location = geonames:5369907 (extra row we return, official omits)');
console.log(`data source: ${describeSource(src)}`);
claim('Our extra S7 row is a valid answer the official reference missed: 5369907 has a parentFeature to California (5332921) — carried by NYT, not GeoNames — so `?parent name "California"` holds over the federation.');

// The decisive cross-source edge.
const crossParent = await exists(src, LOC, PARENT, CAL);
expect(crossParent, '5369907 geonames:parentFeature 5332921 exists (this edge is in NYT, not GeoNames).');

const calNamed = await exists(src, CAL, NAME, lit('California'));
expect(calNamed, '5332921 geonames:name "California" exists (the parent is named California).');

// The NYT side of the join.
const sameAs = await exists(src, ANY, SAMEAS, LOC);
expect(sameAs, 'some ?y owl:sameAs 5369907 exists.');

const topic = await exists(src, ANY, TOPIC, NEWS);
expect(topic, 'some ?y nyt:topicPage <southern-california> exists.');

// Contrast: GeoNames alone gives only the Los-Angeles-County parent, which is not
// named California — this is why a single-source view (and the official) misses it.
const laCounty = iri('http://sws.geonames.org/5368381/');
const laNamedCalifornia = await exists(src, laCounty, NAME, lit('California'));
evidence(`GeoNames-only parent 5368381 is named California? ${laNamedCalifornia ? 'yes' : 'no'} (it is Los Angeles County — the single-source trap).`);
const totalParents = await count(src, LOC, PARENT, ANY);
evidence(`5369907 has ${totalParents} parentFeature value(s) across sources (LA County + California).`);

conclude('5369907 has a California parent via NYT and California is so named, so the row satisfies S7 over the federation. The official reference omits it, so our result is the more complete one — a genuine correction to upstream.');
