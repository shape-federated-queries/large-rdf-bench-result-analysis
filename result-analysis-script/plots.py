"""Matplotlib figure builders for the COUNT-vs-ASK analysis.

Design (mirrors Traveling-with-a-Map/analysis, adapted to n=3 reps):
- colorblind-safe palette, fixed strategy colours everywhere (count blue, ask magenta);
- log axes where values span orders of magnitude, with a custom power-of-ten formatter;
- per-query summaries = median + min-max whiskers (never std, never violins/boxes);
- aggregate "by experiment" views = strip/dot plots (one dot per query) + a median tick;
- every figure is saved as both .svg and .eps under artefact/<topic>/.
"""

from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np
import pandas as pd

from loaddata import MODES, query_sort_key

# --- palette / style ---------------------------------------------------------

MODE_COLORS = {"count": "#1A85FF", "ask": "#D41159"}
MODE_HATCH = {"count": "///", "ask": ".."}

DEFAULT_FONTSIZE = 15
# Figures are for a paper: no in-figure titles (the LaTeX caption names them). Flip to
# True for exploratory titles when running `marimo edit`.
SHOW_TITLES = False
ARTEFACT_ROOT = Path(__file__).resolve().parent / "artefact"


def _apply_fonts(fig, size: int = DEFAULT_FONTSIZE) -> None:
    for text in fig.findobj(match=plt.Text):
        text.set_fontsize(size)


def _maybe_title(ax, text: str | None, **kw) -> None:
    if text and SHOW_TITLES:
        ax.set_title(text, **kw)


def _log_formatter(ax, axis: str = "y") -> None:
    """Scientific-notation tick labels on a log axis (e.g. 1e+00, 1e+03, 1e+06)."""
    def fmt(val, _pos):
        if val <= 0:
            return ""
        return f"{val:.0e}"
    getattr(ax, f"{axis}axis").set_major_formatter(mticker.FuncFormatter(fmt))


def _ordered_queries(names) -> list[str]:
    return sorted(set(names), key=query_sort_key)


def save(fig, topic: str, name: str) -> Path:
    """Write fig as .svg and .eps under artefact/<topic>/ and return that folder."""
    folder = ARTEFACT_ROOT / topic
    folder.mkdir(parents=True, exist_ok=True)
    for ext in ("svg", "eps"):
        fig.savefig(folder / f"{name}.{ext}", format=ext, bbox_inches="tight")
    return folder


# --- overview figures --------------------------------------------------------

def ratio_bars(pq_setup, value_col: str = "median_time", metric_label: str = "execution time",
               setup: str | None = None):
    """Per-query ask/count ratio for EVERY query the setup ran, around 1.0 (log y).

    pq_setup: per-query rows for one setup with columns name, mode, value_col, error.

    - both modes complete  -> a ratio bar (>1 ask slower, magenta; <1 count slower, blue);
    - only COUNT completes  -> a faint full-height COUNT-coloured column, X near the top
      (ASK could not run it: ratio -> infinity);
    - only ASK completes    -> a faint full-height ASK-coloured column, X near the bottom
      (COUNT could not run it);
    so a strategy that runs more queries stays visible instead of dropping out.
    """
    names = _ordered_queries(pq_setup["name"])
    lut = pq_setup.set_index(["name", "mode"])

    def val(n, m):
        if (n, m) in lut.index:
            row = lut.loc[(n, m)]
            if not bool(row["error"]) and pd.notna(row[value_col]) and row[value_col] > 0:
                return float(row[value_col])
        return None

    ratios = {}
    for n in names:
        c, a = val(n, "count"), val(n, "ask")
        ratios[n] = (c, a)

    finite = [a / c for c, a in ratios.values() if c and a]
    top = max(finite + [1.0]) * 3
    bot = min(finite + [1.0]) / 3

    fig, ax = plt.subplots(figsize=(max(8, 0.55 * len(names)), 6))
    ax.axhline(1.0, color="black", linewidth=1.2, linestyle="--")
    for x, n in enumerate(names):
        c, a = ratios[n]
        if c and a:  # both ran -> real ratio bar
            r = a / c
            ax.bar(x, r, color=MODE_COLORS["ask"] if r > 1 else MODE_COLORS["count"],
                   edgecolor="black", linewidth=0.6, zorder=3)
        elif c and not a:  # no comparison: ASK missing -> just a cross for the missing mode
            ax.scatter([x], [1.0], marker="x", s=90, color=MODE_COLORS["ask"], linewidths=2.5, zorder=4)
        elif a and not c:  # no comparison: COUNT missing
            ax.scatter([x], [1.0], marker="x", s=90, color=MODE_COLORS["count"], linewidths=2.5, zorder=4)
        else:  # neither ran
            ax.scatter([x], [1.0], marker="x", s=70, color="#777777", linewidths=2, zorder=4)

    ax.set_yscale("log")
    ax.set_ylim(bot, top)
    _log_formatter(ax, "y")
    ax.set_xticks(range(len(names)))
    ax.set_xticklabels(names, rotation=45, ha="right")
    ax.set_ylabel(f"ASK / COUNT {metric_label} ratio")
    _maybe_title(ax, f"COUNT vs ASK {metric_label}" + (f" — {setup}" if setup else ""))
    ax.grid(axis="y", which="both", alpha=0.3)
    from matplotlib.patches import Patch
    from matplotlib.lines import Line2D
    ax.legend(handles=[
        Patch(facecolor=MODE_COLORS["ask"], edgecolor="black", label="ask slower (>1)"),
        Patch(facecolor=MODE_COLORS["count"], edgecolor="black", label="count slower (<1)"),
        Line2D([0], [0], marker="x", color=MODE_COLORS["ask"], linestyle="none",
               markersize=9, markeredgewidth=2.5, label="ask did not terminate (count-only)"),
        Line2D([0], [0], marker="x", color=MODE_COLORS["count"], linestyle="none",
               markersize=9, markeredgewidth=2.5, label="count did not terminate (ask-only)"),
        Line2D([0], [0], marker="x", color="#777777", linestyle="none",
               markersize=8, markeredgewidth=2, label="neither terminated"),
    ], loc="best", fontsize=DEFAULT_FONTSIZE - 4)
    _apply_fonts(fig)
    fig.tight_layout()
    return fig


def grouped_bars_per_query(pq_setup, value_col: str, ylabel: str, setup: str | None = None,
                           log: bool = True):
    """One setup: count vs ask bars per query for a raw metric (e.g. HTTP requests).

    pq_setup: rows for one setup with columns name, mode, value_col, error. A query with
    no value in a mode (did not terminate / no data) is drawn as an X at the axis floor,
    so a strategy that completes fewer queries stays visible.
    """
    names = _ordered_queries(pq_setup["name"])
    x = np.arange(len(names))
    width = 0.4
    fig, ax = plt.subplots(figsize=(max(8, 0.55 * len(names)), 6))
    missing = {}
    n_ok = {}
    for i, mode in enumerate(MODES):
        m = pq_setup[pq_setup["mode"] == mode].set_index(["name"])
        vals = np.array([m[value_col].get(n, np.nan) if n in m.index else np.nan
                         for n in names], dtype=float)
        pos = x + (i - 0.5) * width
        ax.bar(pos, vals, width, color=MODE_COLORS[mode], hatch=MODE_HATCH[mode],
               edgecolor="black", linewidth=0.5)
        missing[mode] = pos[~np.isfinite(vals)]
        n_ok[mode] = int(np.isfinite(vals).sum())
    if log:
        ax.set_yscale("log")
        ax.set_ylim(bottom=1)  # start the axis at 1e0
        _log_formatter(ax, "y")
    y0 = ax.get_ylim()[0]
    for mode in MODES:
        if len(missing[mode]):
            ax.scatter(missing[mode], np.full(len(missing[mode]), y0 * (1.6 if log else 1)),
                       marker="x", s=70, color=MODE_COLORS[mode], linewidths=2, zorder=5)
    ax.set_xticks(x)
    ax.set_xticklabels(names, rotation=45, ha="right")
    ax.set_ylabel(ylabel)
    _maybe_title(ax, f"{ylabel} (count vs ask)" + (f" — {setup}" if setup else ""))
    ax.grid(axis="y", which="both", alpha=0.3)
    from matplotlib.patches import Patch
    from matplotlib.lines import Line2D
    handles = []
    for mode in MODES:
        handles.append(Patch(facecolor=MODE_COLORS[mode], hatch=MODE_HATCH[mode],
                             edgecolor="black", label=f"{mode} (n={n_ok[mode]})"))
    for mode in MODES:
        handles.append(Line2D([0], [0], marker="x", color=MODE_COLORS[mode], linestyle="none",
                              markersize=9, markeredgewidth=2.5, label=f"{mode} did not terminate"))
    ax.legend(handles=handles, fontsize=DEFAULT_FONTSIZE - 3)
    _apply_fonts(fig)
    fig.tight_layout()
    return fig
