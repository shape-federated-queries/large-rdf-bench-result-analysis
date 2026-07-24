"""Data loaders for the LargeRDFBench COUNT-vs-ASK analysis (ad-hoc harness).

Loaders return *tidy* pandas DataFrames so the notebooks can slice/aggregate freely.
The single raw source is the ad-hoc harness metrics:

- ad-hoc timing / planning / HTTP : results/<setup>/output-adhoc/<mode>/metrics.json

COUNT vs ASK are two Comunica source-selection strategies (cardinalityCountQueries
true/false) run over the *same* queries, stored as count/ask subfolders in the ad-hoc
output.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

# --- constants ---------------------------------------------------------------

SETUPS = ["comunica", "mixed", "qlever"]
MODES = ["count", "ask"]

# results/ lives one directory above this file (in the project root).
DEFAULT_DATA_ROOT = Path(__file__).resolve().parent.parent

_FAMILY_RANK = {"S": 0, "C": 1, "B": 2}


# --- small helpers -----------------------------------------------------------

def query_sort_key(name: str) -> tuple[int, int]:
    """Natural order for query names: S1..S14, C1..C10, B1..B8."""
    family, num = name[0], name[1:]
    return (_FAMILY_RANK.get(family, 9), int(num) if num.isdigit() else 0)


# --- loaders -----------------------------------------------------------------

def load_adhoc_metrics(data_root: Path | str = DEFAULT_DATA_ROOT) -> pd.DataFrame:
    """Load the ad-hoc metrics.json (planning time) for every setup x mode.

    Returns one row per (setup, mode, query, rep). Failed reps carry `error` set and
    NaN metric columns.
    """
    data_root = Path(data_root)
    records = []
    for setup in SETUPS:
        for mode in MODES:
            path = data_root / "results" / setup / "output-adhoc" / mode / "metrics.json"
            payload = json.loads(path.read_text())
            for q in payload.get("queries", []):
                for run in q.get("runs", []):
                    records.append({
                        "setup": setup,
                        "mode": mode,
                        "name": q["name"],
                        "rep": run.get("rep"),
                        "planningMs": run.get("planningMs", np.nan),
                        "totalMs": run.get("totalMs", np.nan),
                        "httpRequests": run.get("httpRequests", np.nan),
                        "results": run.get("results", np.nan),
                        "error": run.get("error"),
                    })
    return pd.DataFrame.from_records(records)


def per_query_planning(adhoc_df: pd.DataFrame) -> pd.DataFrame:
    """One row per (setup, mode, query): median/min/max planning & total time and
    median HTTP requests over the successful reps."""
    records = []
    for (setup, mode, name), sub in adhoc_df.groupby(["setup", "mode", "name"]):
        ok = sub[sub["error"].isna()]
        plan = ok["planningMs"].dropna()
        total = ok["totalMs"].dropna()
        http = ok["httpRequests"].dropna()
        records.append({
            "setup": setup,
            "mode": mode,
            "name": name,
            "median_planning": float(plan.median()) if len(plan) else np.nan,
            "min_planning": float(plan.min()) if len(plan) else np.nan,
            "max_planning": float(plan.max()) if len(plan) else np.nan,
            "median_total": float(total.median()) if len(total) else np.nan,
            "median_http": float(http.median()) if len(http) else np.nan,
            "n_ok": int(len(plan)),
            "error": bool(len(ok) == 0),
        })
    out = pd.DataFrame.from_records(records)
    out["sort_key"] = out["name"].map(query_sort_key)
    return out.sort_values(["setup", "mode", "sort_key"]).drop(columns="sort_key").reset_index(drop=True)


def count_ask_ratio(per_query_df: pd.DataFrame, value_col: str = "median_time") -> pd.DataFrame:
    """Per-query ask/count ratio for a metric, paired on queries that succeeded
    (non-error, positive value) in *both* modes within a setup.

    Returns columns: setup, name, count, ask, ratio.
    """
    keep = per_query_df[~per_query_df["error"].astype(bool)].copy()
    pivot = keep.pivot_table(index=["setup", "name"], columns="mode", values=value_col, aggfunc="first")
    pivot = pivot.dropna(subset=["count", "ask"])
    pivot = pivot[(pivot["count"] > 0) & (pivot["ask"] > 0)]
    pivot["ratio"] = pivot["ask"] / pivot["count"]
    return pivot.reset_index()[["setup", "name", "count", "ask", "ratio"]]


def overall_ratio(ratio_df: pd.DataFrame, universe: int = 24) -> pd.DataFrame:
    """Per-experiment overall ask/count ratio = **average (arithmetic mean)** of the
    per-query ratios.

    Only ~4-5 queries complete in both modes per experiment, so this mean is sensitive
    to outliers (e.g. qlever S1 at 552x) — plot the individual per-query ratios
    alongside it. `universe` is the number of comparable queries (S1-S14 + C1-C10 = 24)
    used to report how many were excluded because they failed in at least one mode.

    Returns columns: setup, ratio, n_used, n_excluded.
    """
    rows = []
    for setup in SETUPS:
        r = ratio_df.loc[ratio_df["setup"] == setup, "ratio"].to_numpy()
        mean = float(np.mean(r)) if len(r) else np.nan
        rows.append({"setup": setup, "ratio": mean, "n_used": int(len(r)),
                     "n_excluded": universe - int(len(r))})
    return pd.DataFrame(rows)
