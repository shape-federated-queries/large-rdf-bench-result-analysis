# Preliminary validation — LargeRDFBench (qlever / mixed / comunica)

_Preliminary; runs in progress. Status vs. official reference results._

**Legend:** ✅ OK · ⚠️ mismatch (ran, differs from reference) · ❌ error (timeout/fetch/OOM) · – not run / no reference

## Per-query status

| Query | qlever count | qlever ask | mixed count | mixed ask | comunica count | comunica ask |
|---|---|---|---|---|---|---|
| C2 | ❌ | ❌ | ❌ | – | ❌ | – |
| C3 | ❌ | ❌ | ❌ | – | ❌ | – |
| C6 | ❌ | ❌ | ❌ | – | ❌ | – |
| C7 | ⚠️ | ❌ | ❌ | – | ❌ | – |
| C8 | ⚠️ | ❌ | ❌ | – | ❌ | – |
| C10 | ⚠️ | ❌ | ⚠️ | – | ❌ | – |
| S1 | ✅ | ✅ | ✅ | – | ✅ | ✅ |
| S2 | ✅ | ✅ | ✅ | – | ✅ | ✅ |
| S3 | ✅ | ❌ | ✅ | – | ❌ | ❌ |
| S4 | ✅ | ❌ | ✅ | – | ❌ | ❌ |
| S5 | ✅ | ❌ | ✅ | – | ❌ | ❌ |
| S6 | ⚠️ | ❌ | ⚠️ | – | ❌ | ❌ |
| S7 | ⚠️ | ❌ | ❌ | – | ❌ | ❌ |
| S8 | ⚠️ | ⚠️ | ⚠️ | – | ⚠️ | ⚠️ |
| S9 | ✅ | ✅ | ✅ | – | ❌ | ✅ |
| S10 | ✅ | ❌ | ✅ | – | ❌ | ❌ |
| S11 | ✅ | ✅ | ✅ | – | ❌ | ❌ |
| S12 | ✅ | ❌ | ❌ | – | ❌ | ❌ |
| S13 | ✅ | ✅ | ❌ | – | ❌ | ❌ |
| S14 | ⚠️ | ⚠️ | ⚠️ | – | ❌ | ⚠️ |

## Success ratios (over 20 evaluated S+C queries)

| Setup / mode | ✅ OK | ⚠️ mism | ❌ err | – not-run | OK ratio | answered (OK+mism) |
|---|---|---|---|---|---|---|
| qlever count | 10 | 7 | 3 | 0 | 10/20 (50%) | 17/20 (85%) |
| qlever ask | 5 | 2 | 13 | 0 | 5/20 (25%) | 7/20 (35%) |
| mixed count | 8 | 4 | 8 | 0 | 8/20 (40%) | 12/20 (60%) |
| mixed ask | 0 | 0 | 0 | 20 | 0/20 (0%) | 0/20 (0%) |
| comunica count | 2 | 1 | 17 | 0 | 2/20 (10%) | 3/20 (15%) |
| comunica ask | 3 | 2 | 9 | 6 | 3/20 (15%) | 5/20 (25%) |

_Notes: mixed-ask not run yet; comunica-ask still running; C1/C4/C5/C9 have no official reference; before encoding/precision/null-column fixes land._
