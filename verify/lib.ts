#!/usr/bin/env bun

import { rdfParser } from 'rdf-parse';
import { createReadStream } from 'node:fs';

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

export function iri(x: string): Term {
  const c = x.indexOf(':');
  if (c > 0 && PREFIXES[x.slice(0, c)]) return { t: 'iri', v: PREFIXES[x.slice(0, c)] + x.slice(c + 1) };
  return { t: 'iri', v: x };
}
export function lit(v: string, o: { dt?: string; lang?: string } = {}): Term {
  return { t: 'lit', v, dt: o.dt ? iri(o.dt).v : undefined, lang: o.lang };
}

// --- the one primitive: how many times does triple (s,p,o) occur in `file`? ---

/** grep an .nt file, or parse any other file once with rdf-parse. */
async function countIn(file: string, s: Term, p: Term, o: Term): Promise<number> {
  return file.endsWith('.nt') ? grepNt(file, s, p, o) : await parseFile(file, s, p, o);
}
export async function existsIn(file: string, s: Term, p: Term, o: Term): Promise<boolean> {
  return (await countIn(file, s, p, o)) > 0;
}

function ntFragment(t: Term): string | null {
  if (t.t === 'var') return null;
  if (t.t === 'iri') return `<${t.v}>`;
  const s = '"' + t.v! + '"';
  return t.lang ? `${s}@${t.lang}` : t.dt ? `${s}^^<${t.dt}>` : s;
}
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

function grepNt(file: string, s: Term, p: Term, o: Term): number {
  const parts = [s, p, o].map(ntFragment).filter((x): x is string => x !== null).map(reEsc);
  if (parts.length === 0) throw new Error('at least one concrete term is required');
  const r = Bun.spawnSync(['grep', '-Ec', parts.join('.*'), file]);
  return Number(r.stdout.toString().trim() || '0');
}

function termMatch(q: any, t: Term): boolean {
  if (t.t === 'var') return true;
  if (t.t === 'iri') return q.termType === 'NamedNode' && q.value === t.v;
  if (q.termType !== 'Literal' || q.value !== t.v) return false;
  if (t.lang) return q.language === t.lang;
  if (t.dt) return q.datatype?.value === t.dt;
  return true;
}

function parseFile(file: string, s: Term, p: Term, o: Term): Promise<number> {
  return new Promise((resolve) => {
    let n = 0;
    const quads = rdfParser.parse(createReadStream(file), { path: file });
    quads.on('data', (q: any) => {
      if (termMatch(q.subject, s) && termMatch(q.predicate, p) && termMatch(q.object, o)) n++;
    });
    quads.on('end', () => resolve(n));
    quads.on('error', () => resolve(n)); // tolerate malformed input
  });
}

// --- narration -------------------------------------------------------------

let failures = 0;
export function title(s: string) { console.log(`\n=== ${s} ===`); }
export function claim(s: string) { console.log(`CLAIM: ${s}`); }
export function section(s: string) { console.log(`\n--- ${s} ---`); }
export function evidence(s: string) { console.log(`  • ${s}`); }
export function expect(ok: boolean, s: string) {
  if (!ok) failures++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${s}`);
}
export function conclude(s: string) {
  console.log(`\n=> ${failures === 0 ? 'JUSTIFIED' : 'NOT JUSTIFIED'}: ${s}`);
  process.exit(failures === 0 ? 0 : 1);
}
