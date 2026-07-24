"""Table exporters: the same DataFrame goes out as GitHub-Markdown (for the lab
notes / notebook display) and as LaTeX (for the paper), both under artefact/<topic>/.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
from tabulate import tabulate

ARTEFACT_ROOT = Path(__file__).resolve().parent / "artefact"


def _folder(topic: str) -> Path:
    d = ARTEFACT_ROOT / topic
    d.mkdir(parents=True, exist_ok=True)
    return d


def to_markdown(df: pd.DataFrame, topic: str, name: str) -> Path:
    """Write df as a GitHub-flavoured Markdown table."""
    folder = _folder(topic)
    text = tabulate(df.values.tolist(), headers=list(df.columns), tablefmt="github")
    path = folder / f"{name}.md"
    path.write_text(text + "\n")
    return path


def to_latex(df: pd.DataFrame, topic: str, name: str, caption: str, label: str) -> Path:
    """Write df as a booktabs LaTeX table wrapped in a table environment.

    Cell values are emitted verbatim (tablefmt="latex_raw"), so any math / \\boldsymbol
    formatting placed in the DataFrame is preserved.
    """
    folder = _folder(topic)
    body = tabulate(df.values.tolist(), headers=list(df.columns), tablefmt="latex_raw")
    tex = (
        "\\begin{table}[t]\n\\centering\n"
        f"{body}\n"
        f"\\caption{{{caption}}}\n"
        f"\\label{{{label}}}\n"
        "\\end{table}\n"
    )
    path = folder / f"{name}.tex"
    path.write_text(tex)
    return path


def export(df: pd.DataFrame, topic: str, name: str, caption: str, label: str) -> pd.DataFrame:
    """Write both the Markdown and LaTeX versions; return df unchanged for chaining/display."""
    to_markdown(df, topic, name)
    to_latex(df, topic, name, caption, label)
    return df
