# result_analysis_large_rdf_bench

Validates our LargeRDFBench results against the official expected results.

```bash
bun install          # inits the benchmark submodule + generates benchmark/results
bun index.ts         # compare data/count against benchmark/results
```

`bun index.ts [resultsDir] [officialDir]` to override the defaults. Bindings are
compared as an order-independent multiset (literal whitespace ignored).
