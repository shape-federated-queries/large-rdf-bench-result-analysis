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
const OUT_DIR = 'report';
const SUMMARY_OUT = `${OUT_DIR}/summary.json`;
const MISMATCH_OUT = `${OUT_DIR}/mismatches.json`;

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
  return `L|${lang}|${dt}|${t.value.replace(/\s+/gu, ' ').trim()}`;
}

async function loadRows(file: string): Promise<string[] | null> {
  const f = Bun.file(file);
  if (!(await f.exists())) {
    return null;
  }
  const j = (await f.json()) as Srj;
  const vars = [...(j.head?.vars ?? [])].sort();
  return (j.results?.bindings ?? []).map(row => vars.map(v => `${v}=${termKey(row[v])}`).join('\t'));
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
  const got = await loadRows(join(RESULTS, `${name}.srj`));
  if (got !== null) {
    const ref = (await loadRows(join(OFFICIAL, `${name}.srj`))) ?? [];
    const { missing, extra } = diff(got, ref);
    if (missing.length === 0 && extra.length === 0) {
      return { name, status: 'OK', got: got.length, ref: ref.length };
    }
    return { name, status: 'MISMATCH', got: got.length, ref: ref.length, missing, extra };
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
