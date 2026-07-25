import marimo

__generated_with = "0.23.14"
app = marimo.App(width="medium")

with app.setup:
    import os
    import sys

    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    import matplotlib

    matplotlib.use("Agg")

    import marimo as mo
    import pandas as pd

    import loaddata as L
    import plots as P
    import tables as T

    TOPIC = "overview_adhoc"


@app.cell(hide_code=True)
def _():
    mo.md(r"""
    # COUNT vs ASK — ad-hoc execution time

    The same per-query ask/count ratio figure as the overview, but computed from the
    **ad-hoc** harness (`metrics.json`, `totalMs`) instead of jbr. A query that did not
    terminate under a strategy is shown as a cross (no ratio), so each strategy's
    coverage stays visible.
    """)
    return


@app.cell
def load():
    ppl = L.per_query_planning(L.load_adhoc_metrics())
    ppl = ppl[ppl["name"].str.startswith(("S", "C"))].reset_index(drop=True)  # drop B* (never run)
    return (ppl,)


@app.cell(hide_code=True)
def _():
    mo.md(r"""
    ## Per-query ask/count execution-time ratio (ad-hoc, qlever)
    """)
    return


@app.cell
def ratio_adhoc(ppl):
    fig = P.ratio_bars(ppl[ppl["setup"] == "qlever"], value_col="median_total",
                       metric_label="execution time (ad-hoc)", setup="qlever")
    P.save(fig, TOPIC, "ratio_exec_adhoc_qlever")
    fig
    return


@app.cell(hide_code=True)
def _():
    mo.md(r"""
    ## Raw execution time per query (ad-hoc, qlever) — count vs ask
    """)
    return


@app.cell
def exec_adhoc(ppl):
    fig_exec = P.grouped_bars_per_query(ppl[ppl["setup"] == "qlever"], "median_total",
                                        ylabel="Execution time (ms)", setup="qlever", log=True)
    P.save(fig_exec, TOPIC, "exec_time_adhoc_qlever")
    fig_exec
    return


@app.cell(hide_code=True)
def _():
    mo.md(r"""
    ## Raw HTTP requests per query (ad-hoc, qlever)
    """)
    return


@app.cell
def http_adhoc(ppl):
    fig_http = P.grouped_bars_per_query(ppl[ppl["setup"] == "qlever"], "median_http",
                                        ylabel="HTTP requests per query", setup="qlever")
    P.save(fig_http, TOPIC, "http_requests_qlever")
    fig_http
    return


@app.cell(hide_code=True)
def _():
    mo.md(r"""
    ## Overall ask/count execution-time ratio by experiment (ad-hoc, table)
    """)
    return


@app.cell
def overall_table_adhoc(ppl):
    exec_overall = L.overall_ratio(L.count_ask_ratio(ppl, "median_total"))
    plan_overall = L.overall_ratio(L.count_ask_ratio(ppl, "median_planning"))
    # failed queries per strategy = errored (no successful rep) in the ad-hoc harness.
    fails = ppl.groupby(["setup", "mode"])["error"].sum().unstack(fill_value=0).astype(int)
    merged = exec_overall.merge(
        plan_overall[["setup", "ratio"]].rename(columns={"ratio": "plan_ratio"}), on="setup"
    )
    setup_name = {"comunica": "all-Comunica", "mixed": "mixed", "qlever": "all-QLever"}
    order = ["comunica", "mixed", "qlever"]
    m = merged.set_index("setup")
    rows = [[
        setup_name[s],
        f"{m.loc[s, 'ratio']:.1f}x",
        f"{m.loc[s, 'plan_ratio']:.1f}x",
        int(m.loc[s, "n_used"]),
        int(fails["count"][s]),
        int(fails["ask"][s]),
    ] for s in order]
    table = pd.DataFrame(rows, columns=[
        "Configuration", "Exec. ratio", "Plan. ratio", "Queries", "Fail. COUNT", "Fail. ASK"])
    T.to_markdown(table, TOPIC, "table_overall_ratio_adhoc")

    template = os.path.join(os.path.dirname(T.__file__), "templates", "table_overall_ratio_adhoc.tex")
    with open(template) as f:
        tex = f.read()
    for row in rows:
        for value in row[1:]:
            tex = tex.replace("{}", str(value), 1)
    (T.ARTEFACT_ROOT / TOPIC).mkdir(parents=True, exist_ok=True)
    (T.ARTEFACT_ROOT / TOPIC / "table_overall_ratio_adhoc.tex").write_text(tex)
    mo.ui.table(table, selection=None)
    return


@app.cell
def qlever_median_table(ppl):
    def stats(series, dec):
        return [
            f"{series.median():.{dec}f}",
            f"{series.min():.{dec}f}",
            f"{series.max():.{dec}f}",
        ]

    q_ok = ppl[(ppl["setup"] == "qlever") & (~ppl["error"].astype(bool))]
    common = set(q_ok[q_ok["mode"] == "ask"]["name"]) & set(q_ok[q_ok["mode"] == "count"]["name"])
    paired = q_ok[q_ok["name"].isin(common)]

    cells = []
    for mode in ("ask", "count"):
        strat = paired[paired["mode"] == mode]
        cells.extend(stats(strat["median_planning"].dropna(), 0))
        cells.extend(stats(strat["median_total"].dropna() / 1000.0, 1))
    pl_ratio = L.count_ask_ratio(ppl, "median_planning")
    ex_ratio = L.count_ask_ratio(ppl, "median_total")
    cells.extend(stats(pl_ratio[pl_ratio["setup"] == "qlever"]["ratio"], 2))
    cells.extend(stats(ex_ratio[ex_ratio["setup"] == "qlever"]["ratio"], 2))

    qlever_template = os.path.join(
        os.path.dirname(T.__file__), "templates", "table_qlever_ask_count_adhoc.tex")
    with open(qlever_template) as qlever_f:
        qlever_tex = qlever_f.read()
    for qlever_value in cells:
        qlever_tex = qlever_tex.replace("{}", qlever_value, 1)
    (T.ARTEFACT_ROOT / TOPIC).mkdir(parents=True, exist_ok=True)
    (T.ARTEFACT_ROOT / TOPIC / "table_qlever_ask_count_adhoc.tex").write_text(qlever_tex)
    mo.md(f"common queries n={len(common)}; cells={cells}")
    return


@app.cell
def _():
    return


if __name__ == "__main__":
    app.run()
