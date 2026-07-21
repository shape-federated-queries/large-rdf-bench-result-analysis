#!/usr/bin/env bun
// C7 — is the run-to-run incompleteness recoverable, and can we assemble a
// COMPLETE C7 answer set? C7's mandatory part is stable, but its cross-source
// OPTIONAL (place dbpedia:capital / geo) is dropped by a single federated run
// under `--lenient` + endpoint load. We test that here:
//
//   1. run C7 WITHOUT the OPTIONAL once  -> the stable base rows (written to no_opt_C7.srj);
//   2. run C7 WITH the OPTIONAL N times  -> union the runs to recover rows/columns any
//      single run drops. If the union covers the whole reference (validity by count),
//      it is written to valid_C7.srj.
//
// Sources are the SPARQL endpoints to federate over (pass a set):
//   bun verify/c7-rerun.ts --endpoint http://h1:3002/sparql --endpoint http://h2:3002/sparql [...] [--n 10] [--out-dir .] [--strict] [--timeout 300000]
//   bun verify/c7-rerun.ts --endpoints-file <endpoints.json> [--n 10]     # experiment endpoints.json format
//
// Run it where the endpoints are reachable (e.g. an experiment client).

import { QueryEngine } from '@comunica/query-sparql';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv;
const getAll = (f: string) => argv.flatMap((v, i) => (v === f && argv[i + 1] ? [ argv[i + 1] ] : []));
const get = (f: string, d?: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const has = (f: string) => argv.includes(f);

const endpoints = getAll('--endpoint');
const efile = get('--endpoints-file');
if (efile) {
  const j = JSON.parse(readFileSync(efile, 'utf8'));
  for (const k of Object.keys(j.endpoints ?? {})) endpoints.push(`http://${j.endpoints[k].host}:${j.endpoints[k].port}/sparql`);
}
if (endpoints.length === 0) {
  console.error('Provide sources: --endpoint <url> (repeatable) and/or --endpoints-file <endpoints.json>');
  process.exit(2);
}
const N = Number(get('--n', '10'));
const OUTDIR = get('--out-dir', import.meta.dirname)!;
const REF = get('--ref', join(import.meta.dirname, '..', 'benchmark', 'results', 'C7.srj'))!;
const TIMEOUT = Number(get('--timeout', '300000'));
const lenient = !has('--strict');

const PREFIXES = [
  'prefix swc: <http://data.semanticweb.org/ns/swc/ontology#>',
  'prefix swrc: <http://swrc.ontoware.org/ontology#>',
  'prefix eswc: <http://data.semanticweb.org/conference/eswc/>',
  'prefix foaf: <http://xmlns.com/foaf/0.1/>',
  'prefix dbpedia: <http://dbpedia.org/ontology/>',
  'prefix geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>',
].join('\n');
const BASE = `?role swc:isRoleAt eswc:2010 .
  ?role swc:heldBy ?author .
  ?proceedings swc:relatedToEvent eswc:2010 .
  ?paper swrc:author ?author .
  ?author foaf:based_near ?place .
  ?paper swc:isPartOf ?proceedings .`;
const OPT = `OPTIONAL { ?place dbpedia:capital ?capital ; geo:lat ?latitude ; geo:long ?longitude . }`;
const Q_BASE = `${PREFIXES}\nSELECT DISTINCT ?author ?role ?paper ?place ?proceedings WHERE {\n  ${BASE}\n}`;
const Q_FULL = `${PREFIXES}\nSELECT DISTINCT ?author ?role ?paper ?place ?capital ?latitude ?longitude ?proceedings WHERE {\n  ${BASE}\n  ${OPT}\n}`;
const BASE_VARS = [ 'author', 'role', 'paper', 'place', 'proceedings' ];
const FULL_VARS = [ 'author', 'role', 'paper', 'place', 'capital', 'latitude', 'longitude', 'proceedings' ];

const context = () => ({
  sources: endpoints.map(u => ({ type: 'sparql' as const, value: u })),
  lenient,
  invalidateCache: true,
  '@comunica/bus-http:http-retry-count': 20,
});

function toObj(binding: any): Record<string, any> {
  const o: Record<string, any> = {};
  for (const [ k, v ] of binding) {
    const type = v.termType === 'NamedNode' ? 'uri' : v.termType === 'BlankNode' ? 'bnode' : 'literal';
    const e: any = { type, value: v.value };
    if (type === 'literal') {
      if (v.language) e['xml:lang'] = v.language;
      else if (v.datatype && v.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string') e.datatype = v.datatype.value;
    }
    o[k.value] = e;
  }
  return o;
}
const key = (o: Record<string, any>) =>
  JSON.stringify(Object.keys(o).sort().map(k => [ k, o[k].type, o[k].value, o[k].datatype ?? '', o[k]['xml:lang'] ?? '' ]));
const writeSrj = (name: string, vars: string[], rows: Record<string, any>[]) => {
  const p = join(OUTDIR, name);
  writeFileSync(p, `${JSON.stringify({ head: { vars }, results: { bindings: rows } }, null, 2)}\n`);
  return p;
};

async function runOnce(query: string): Promise<Record<string, any>[] | null> {
  const engine = new QueryEngine();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const stream = await engine.queryBindings(query, { ...context(), signal: controller.signal });
    const rows = await stream.toArray();
    return rows.map(toObj);
  } catch (e) {
    console.log(`  (run error: ${String((e as Error).message ?? e).split('\n')[0]})`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

console.log(`=== C7 rerun/union over ${endpoints.length} endpoint(s) | lenient=${lenient} | n=${N} ===`);
console.log('sources:', endpoints.join(', '));

// 1. base rows (no OPTIONAL) — the mandatory part, expected to be stable/complete.
const base = await runOnce(Q_BASE);
if (base) {
  const p = writeSrj('no_opt_C7.srj', BASE_VARS, base);
  console.log(`\n[base, no OPTIONAL] rows = ${base.length} -> wrote ${p}`);
} else {
  console.log('\n[base, no OPTIONAL] FAILED');
}

// 2. full query N times, unioned.
const seen = new Map<string, Record<string, any>>();
const perRun: number[] = [];
for (let i = 1; i <= N; i++) {
  const rows = await runOnce(Q_FULL);
  if (rows === null) { console.log(`[full ${i}/${N}] failed`); continue; }
  perRun.push(rows.length);
  for (const r of rows) { const k = key(r); if (!seen.has(k)) seen.set(k, r); }
  console.log(`[full ${i}/${N}] rows = ${rows.length}, union so far = ${seen.size}`);
}
const union = [ ...seen.values() ];
if (perRun.length > 0) {
  console.log(`\nper-run full rows: min=${Math.min(...perRun)} max=${Math.max(...perRun)}`);
  console.log(`UNION of ${perRun.length} successful run(s) = ${union.length} rows (recovered ${union.length - Math.max(...perRun)} beyond the best single run)`);
}

// 3. validity by count: does the union cover every reference row?
let complete = false;
if (existsSync(REF)) {
  const ref = (JSON.parse(readFileSync(REF, 'utf8')).results.bindings) as Record<string, any>[];
  const unionKeys = new Set(union.map(key));
  const covered = ref.filter(r => unionKeys.has(key(r))).length;
  complete = covered === ref.length;
  console.log(`reference ${REF}: ${ref.length} rows; union covers ${covered}/${ref.length} (exact-row match)`);
} else {
  console.log(`reference ${REF} not found — cannot judge completeness by count.`);
}

// 4. emit: valid_C7.srj only if the union is complete by count; otherwise the partial union.
if (complete) {
  const p = writeSrj('valid_C7.srj', FULL_VARS, union);
  console.log(`\nVALID: union covers the full reference -> wrote ${p} (${union.length} rows)`);
} else {
  const p = writeSrj('C7_union_partial.srj', FULL_VARS, union);
  console.log(`\nNOT YET COMPLETE: union does not cover the whole reference -> wrote ${p} (${union.length} rows). Rerun with a larger --n.`);
}
