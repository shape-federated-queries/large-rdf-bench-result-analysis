#!/usr/bin/env bun
// bun index.ts [resultsDir] [officialDir]
// Writes summary.json (verdict per query) and, when any query mismatches,
// mismatches.json (what is missing/extra per mismatching query).
import { join } from 'node:path';

interface Term { type: string; value: string; datatype?: string; 'xml:lang'?: string }
type Binding = Record<string, Term>;
interface Srj { head?: { vars?: string[] }; results?: { bindings?: Binding[] } }

type Status = 'OK' | 'MISMATCH' | 'ERROR' | 'MISSING';
interface Row { row: string; count: number }
interface Query {
  name: string;
  status: Status;
  got?: number;
  ref?: number;
  error?: string;
  missing?: Row[];
  extra?: Row[];
}

const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';
const RESULTS = process.argv[2] ?? 'data/count';
const OFFICIAL = process.argv[3] ?? 'benchmark/results';
const OUT_DIR = `report/${RESULTS.replace(/^data\//u, '').replace(/\/+$/u, '') || 'default'}`;
const SUMMARY_OUT = `${OUT_DIR}/summary.json`;
const MISMATCH_OUT = `${OUT_DIR}/mismatches.json`;

// xsd numeric datatypes. Engines disagree on both the numeric type (e.g. double
// vs decimal) and the serialized precision of the same value, so for evaluation
// we compare numeric literals by value at NUM_SIG significant figures, ignoring
// the specific numeric datatype. This normalization is discussed in the paper.
const NUMERIC = new Set([
  'double', 'float', 'decimal', 'integer', 'int', 'long', 'short', 'byte',
  'nonNegativeInteger', 'positiveInteger', 'nonPositiveInteger', 'negativeInteger',
  'unsignedLong', 'unsignedInt', 'unsignedShort', 'unsignedByte',
]);
const NUM_SIG = 6;

// Whitespace flattened on both sides; RDF 1.1 lang-less literal is xsd:string.
function termKey(t: Term | undefined): string {
  if (!t) {
    return '∅';
  }
  if (!t.type.includes('literal')) {
    return `${t.type}|${t.value}`;
  }
  const lang = (t['xml:lang'] ?? '').toLowerCase();
  const dt = lang ? '' : (t.datatype ?? XSD_STRING);
  if (!lang && NUMERIC.has(dt.split('#').pop() ?? '')) {
    const n = Number(t.value);
    if (Number.isFinite(n)) {
      return `NUM|${n.toPrecision(NUM_SIG)}`;
    }
  }
  return `L|${lang}|${dt}|${t.value.replace(/\s+/gu, ' ').trim()}`;
}

async function loadSrj(file: string): Promise<{ vars: string[]; bindings: Binding[] } | null> {
  const f = Bun.file(file);
  if (!(await f.exists())) {
    return null;
  }
  const j = (await f.json()) as Srj;
  return { vars: [...(j.head?.vars ?? [])], bindings: j.results?.bindings ?? [] };
}

// Build one comparable key per binding over `vars` (sorted). A column that is
// unbound in every row on both sides carries no answer, so the caller drops it
// before calling this; that keeps engines that project an all-unbound SELECT
// variable comparable with engines that omit it from head.vars.
function rowKeys(bindings: Binding[], vars: string[]): string[] {
  const cols = [...vars].sort();
  return bindings.map(row => cols.map(v => `${v}=${termKey(row[v])}`).join('\t'));
}

async function firstErrorLine(file: string): Promise<string | null> {
  const f = Bun.file(file);
  if (!(await f.exists())) {
    return null;
  }
  const lines = (await f.text()).split('\n').map(s => s.trim());
  return lines.find(Boolean) ?? '';
}

// Map each row key to how many times it occurs (its multiplicity in the multiset).
function countOccurrences(keys: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of keys) {
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function diff(got: string[], ref: string[]): { missing: Row[]; extra: Row[] } {
  const g = countOccurrences(got);
  const r = countOccurrences(ref);
  const missing: Row[] = [];
  const extra: Row[] = [];
  for (const [row, n] of r) {
    const gap = n - (g.get(row) ?? 0);
    if (gap > 0) {
      missing.push({ row, count: gap });
    }
  }
  for (const [row, n] of g) {
    const gap = n - (r.get(row) ?? 0);
    if (gap > 0) {
      extra.push({ row, count: gap });
    }
  }
  return { missing, extra };
}

async function classify(name: string): Promise<Query> {
  const got = await loadSrj(join(RESULTS, `${name}.srj`));
  if (got !== null) {
    const ref = (await loadSrj(join(OFFICIAL, `${name}.srj`))) ?? { vars: [], bindings: [] };
    // Compare only variables bound in at least one row on either side; a column
    // unbound everywhere carries no answer and its presence in head.vars is an
    // engine-serialization choice, not an answer difference.
    const allVars = [...new Set([...got.vars, ...ref.vars])];
    const liveVars = allVars.filter(v =>
      got.bindings.some(row => row[v]) || ref.bindings.some(row => row[v]));
    const g = rowKeys(got.bindings, liveVars);
    const r = rowKeys(ref.bindings, liveVars);
    const { missing, extra } = diff(g, r);
    if (missing.length === 0 && extra.length === 0) {
      return { name, status: 'OK', got: g.length, ref: r.length };
    }
    return { name, status: 'MISMATCH', got: g.length, ref: r.length, missing, extra };
  }
  const error = await firstErrorLine(join(RESULTS, `${name}.error.txt`));
  if (error !== null) {
    return { name, status: 'ERROR', error };
  }
  return { name, status: 'MISSING' };
}

async function queryNames(dir: string): Promise<string[] | null> {
  try {
    const files = await Array.fromAsync(new Bun.Glob('*.srj').scan({ cwd: dir, onlyFiles: true }));
    return files.map(f => f.slice(0, -4)).sort();
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const names = await queryNames(OFFICIAL);
  if (names === null) {
    console.error(`Official reference dir not found: ${OFFICIAL} (run \`bun run setup\` to generate it)`);
    process.exit(2);
  }

  const queries = await Promise.all(names.map(classify));
  const totals: Record<Status, number> = { OK: 0, MISMATCH: 0, ERROR: 0, MISSING: 0 };
  for (const q of queries) {
    totals[q.status]++;
  }

  const summary = {
    results: RESULTS,
    official: OFFICIAL,
    totals,
    queries: queries.map(({ name, status, got, ref, error }) => ({ name, status, got, ref, error })),
  };
  await Bun.write(SUMMARY_OUT, JSON.stringify(summary, null, 2));

  const mismatches = Object.fromEntries(
    queries
      .filter(q => q.status === 'MISMATCH')
      .map(q => [q.name, { missing: q.missing, extra: q.extra }]),
  );
  if (Object.keys(mismatches).length > 0) {
    await Bun.write(MISMATCH_OUT, JSON.stringify(mismatches, null, 2));
  }

  console.log(JSON.stringify(totals));
  console.log(`wrote ${SUMMARY_OUT}${totals.MISMATCH > 0 ? ` and ${MISMATCH_OUT}` : ''}`);
  process.exit(totals.MISMATCH > 0 ? 1 : 0);
}

await main();
