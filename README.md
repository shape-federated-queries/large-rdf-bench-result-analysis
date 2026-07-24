# result_analysis_large_rdf_bench

Validates our LargeRDFBench results against the official expected results.

```bash
bun install          # inits the benchmark submodule + generates benchmark/results
bun index.ts         # compare data/count against benchmark/results
```

`bun index.ts [resultsDir] [officialDir]` to override the defaults. Bindings are
compared as an order-independent multiset (literal whitespace ignored).

## Analysis (`result-analysis-script/`)

COUNT vs ASK are two Comunica source-selection strategies run over the same queries;
the experiment axis is the endpoint engine (all-Comunica / mixed / all-QLever). The
marimo notebook compares the two strategies on execution time, planning time, HTTP
requests, and failures from the ad-hoc harness (`metrics.json`).

```bash
cd result-analysis-script && make all   # -> artefact/overview_adhoc/
```

Figures (`.svg`/`.eps`) and tables (`.md`/`.tex`) land in
`result-analysis-script/artefact/overview_adhoc/`: the per-query ask/count ratio, the
raw exec-time and HTTP bars (qlever), and the overall-ratio table.

## Proofs (`verify/`)

Standalone `bun` scripts that justify the three queries where our result deviates from
the official reference, grepping the local benchmark datasets for the decisive triple:

- **`s7-parentfeature.ts`** — the duplicate row is faithful: `5332921 geonames:name
  "California"` is asserted by both NYT and GeoNames, so bag semantics keep both matches.
  Our result is swappable (`s7_replacement.json`).
- **`c7-datatype.ts`** — DBpedia carries the coordinates under both xsd:double and
  xsd:float; QLever canonicalizes numeric literals to xsd:decimal, hence the value diff.
- **`c8-encoding.ts`** — the extra eyal-oren rows are genuine: the source carries a
  trailing-space label `"Eyal Oren "`. A real discrepancy (`c8_replacement.json`).

```bash
bun verify/s7-parentfeature.ts --nyt <NYT.nt> --geonames <all-geonames-*.n3>
```
