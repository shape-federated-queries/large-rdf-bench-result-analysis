#!/usr/bin/env bun
// Shared helpers for the "why our result is correct" showcases.
//
// Each case script (see the other files in this directory) states a claim about
// a specific place where our modernized results differ from the official
// LargeRDFBench reference, and then checks that claim *live* against a data
// source the reader chooses:
//
//   --files DIR         local N-Triples datasets (each check is a grep)
//   --endpoint URL      a SPARQL endpoint holding the data (each check is ASK/COUNT)
//   --wall HOST         Virtual Wall: ssh HOST and query the federation endpoint
//                       (default http://127.0.0.1:3001/sparql, override --wall-url)
//
// A reader who doubts that the official result is wrong on a given row runs the
// corresponding case against any of these and sees the edges present/absent.

const PREFIXES: Record<string, string> = {
  foaf: 'http://xmlns.com/foaf/0.1/',
  dbo: 'http://dbpedia.org/ontology/',
  dbr: 'http://dbpedia.org/resource/',
  geo: 'http://www.w3.org/2003/01/geo/wgs84_pos#',
  swc: 'http://data.semanticweb.org/ns/swc/ontology#',
  swrc: 'http://swrc.ontoware.org/ontology#',
  person: 'http://data.semanticweb.org/person/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
};

export type Term = { t: 'iri' | 'lit' | 'var'; v?: string; dt?: string; lang?: string };
export const ANY: Term = { t: 'var' };

export function iri(x: string): Term {
  const c = x.indexOf(':');
  if (c > 0 && PREFIXES[x.slice(0, c)]) return { t: 'iri', v: PREFIXES[x.slice(0, c)] + x.slice(c + 1) };
  return { t: 'iri', v: x };
}
export function lit(v: string, o: { dt?: string; lang?: string } = {}): Term {
  return { t: 'lit', v, dt: o.dt ? iri(o.dt).v : undefined, lang: o.lang };
}

export type Source =
  | { kind: 'files'; dir: string }
  | { kind: 'endpoint'; url: string }
  | { kind: 'wall'; host: string; url: string };

export function source(argv: string[] = Bun.argv): Source {
  const get = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  if (get('--files')) return { kind: 'files', dir: get('--files')! };
  if (get('--endpoint')) return { kind: 'endpoint', url: get('--endpoint')! };
  if (get('--wall')) return { kind: 'wall', host: get('--wall')!, url: get('--wall-url') ?? 'http://127.0.0.1:3001/sparql' };
  console.error('Choose a data source: --files DIR | --endpoint URL | --wall HOST [--wall-url URL]');
  process.exit(2);
}

// --- term serialization ----------------------------------------------------

function sparqlTerm(t: Term, i: number): string {
  if (t.t === 'var') return `?v${i}`;
  if (t.t === 'iri') return `<${t.v}>`;
  const s = '"' + t.v!.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"') + '"';
  return t.lang ? `${s}@${t.lang}` : t.dt ? `${s}^^<${t.dt}>` : s;
}
function ntFragment(t: Term): string | null {
  if (t.t === 'var') return null;
  if (t.t === 'iri') return `<${t.v}>`;
  const s = '"' + t.v! + '"';
  return t.lang ? `${s}@${t.lang}` : t.dt ? `${s}^^<${t.dt}>` : s;
}
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

// --- the two primitives every case uses ------------------------------------

/** Does at least one triple matching (s,p,o) exist in the data source? */
export async function exists(src: Source, s: Term, p: Term, o: Term): Promise<boolean> {
  return (await count(src, s, p, o, true)) > 0;
}

/** How many triples match (s,p,o)? (`stopAtOne` short-circuits for existence.) */
export async function count(src: Source, s: Term, p: Term, o: Term, stopAtOne = false): Promise<number> {
  if (src.kind === 'files') {
    const parts = [s, p, o].map(ntFragment).filter((x): x is string => x !== null).map(reEsc);
    if (parts.length === 0) throw new Error('at least one concrete term is required for files mode');
    const pat = parts.join('.*');
    let total = 0;
    for (const nt of new Bun.Glob('*.nt').scanSync({ cwd: src.dir, absolute: true })) {
      const flag = stopAtOne ? '-m1' : '-c';
      const r = Bun.spawnSync(['grep', '-E', flag, pat, nt]);
      if (stopAtOne) { if (r.exitCode === 0) return 1; }
      else total += Number(r.stdout.toString().trim() || '0');
    }
    return total;
  }
  const s1 = sparqlTerm(s, 1), p1 = sparqlTerm(p, 2), o1 = sparqlTerm(o, 3);
  const q = stopAtOne ? `ASK { ${s1} ${p1} ${o1} }`
    : `SELECT (COUNT(*) AS ?c) WHERE { ${s1} ${p1} ${o1} }`;
  const body = await runSparql(src, q);
  if (stopAtOne) return body.boolean ? 1 : 0;
  return Number(body.results?.bindings?.[0]?.c?.value ?? '0');
}

async function runSparql(src: Source, q: string): Promise<any> {
  if (src.kind === 'endpoint') {
    const res = await fetch(`${src.url}?query=${encodeURIComponent(q)}`,
      { headers: { accept: 'application/sparql-results+json' } });
    return res.json();
  }
  // wall: ssh + curl the federation endpoint
  const remote = `curl -s -m 120 -H 'Accept: application/sparql-results+json' '${src.url}?query=${encodeURIComponent(q)}'`;
  const proc = Bun.spawnSync(['ssh', '-o', 'ConnectTimeout=15', src.host, remote]);
  try { return JSON.parse(proc.stdout.toString()); } catch { return {}; }
}

// --- narration -------------------------------------------------------------

let failures = 0;
export function title(s: string) { console.log(`\n=== ${s} ===`); }
export function claim(s: string) { console.log(`CLAIM: ${s}\n`); }
export function evidence(s: string) { console.log(`  • ${s}`); }
/** Record one expectation; prints PASS/FAIL and tracks the exit status. */
export function expect(ok: boolean, s: string) {
  if (!ok) failures++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${s}`);
}
export function conclude(s: string) {
  console.log(`\n=> ${failures === 0 ? 'JUSTIFIED' : 'NOT JUSTIFIED'}: ${s}`);
  process.exit(failures === 0 ? 0 : 1);
}
export function describeSource(src: Source): string {
  return src.kind === 'files' ? `local files in ${src.dir}`
    : src.kind === 'endpoint' ? `endpoint ${src.url}`
      : `virtual wall ${src.host} (${src.url})`;
}
