"""CLI: python -m pyengine.cli {chain|size|lock}  (stdlib only; tests via pytest)."""
from __future__ import annotations

import argparse
import json

from .core import back_stake_for_target_green, build_chain, green_profit, lay_stake_for_green, r2, size_ticket
from .model import DEFAULTS


def cmd_chain(a: argparse.Namespace) -> None:
    res = build_chain(n_mother=a.n, under=a.under, over=a.over, s0=a.s0,
                      target_base=a.target)
    print(f"{'idx':>3} {'kind':<8} {'N':>3} {'finale':>12} {'stake':>8} {'spent':>9} {'nettoNB':>9} {'true':>9}")
    for r in res["rows"]:
        print(f"{r['index']:>3} {r['kind']:<8} {r['n']:>3} {r['finale']:>12.2f} "
              f"{r['stake']:>8.2f} {r['spent_cum']:>9.2f} {r['netto_no_bleed']:>9.2f} {r['true_netto']:>9.2f}")
    print(f"feasible={res['feasible']} min_true={res['min_true']}")


def cmd_size(a: argparse.Namespace) -> None:
    legs = [{"odds": float(x), "market": "OVER" if i == 0 and a.over_first else "UNDER"}
            for i, x in enumerate(a.legs.split(","))]
    t = size_ticket(legs, spent=a.spent, target=a.target, bleed=a.bleed)
    print(json.dumps({k: (r2(v) if isinstance(v, float) else v) for k, v in t.items()
                      if k != "legs"}, indent=1))


def cmd_lock(a: argparse.Namespace) -> None:
    if a.target is not None:
        back_stake = back_stake_for_target_green(a.target, a.back, a.lay)
        if back_stake is None:
            print(f"infeasible: back_odds {a.back} <= lay_odds {a.lay} (drift wrong way)")
            return
    else:
        back_stake = a.stake
    lay_stake = lay_stake_for_green(back_stake, a.back, a.lay)
    profit = green_profit(back_stake, a.back, a.lay)
    print(json.dumps({"back_stake": back_stake, "back_odds": a.back, "lay_odds": a.lay,
                      "lay_stake": lay_stake, "green_profit": profit}, indent=1))


def main() -> None:
    p = argparse.ArgumentParser(prog="pyengine", description="Low-level math engine")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("chain", help="reference chain mother+coverages+lock")
    c.add_argument("--n", type=int, default=DEFAULTS["mother_n"])
    c.add_argument("--under", type=float, default=DEFAULTS["under"])
    c.add_argument("--over", type=float, default=DEFAULTS["over"])
    c.add_argument("--s0", type=float, default=DEFAULTS["s0"])
    c.add_argument("--target", type=float, default=DEFAULTS["t_base"])
    c.set_defaults(fn=cmd_chain)
    s = sub.add_parser("size", help="size one ticket")
    s.add_argument("--legs", required=True, help="comma odds, e.g. 3.0,1.32,1.32")
    s.add_argument("--spent", type=float, required=True)
    s.add_argument("--target", type=float, default=DEFAULTS["t_base"])
    s.add_argument("--bleed", type=float, default=0.0)
    s.add_argument("--over-first", action="store_true")
    s.set_defaults(fn=cmd_size)

    lk = sub.add_parser("lock", help="back+lay green-up trade (e.g. Inter-Genoa 1@1.45 -> lay@1.40)")
    lk.add_argument("--back", type=float, required=True, help="back odds (opened early)")
    lk.add_argument("--lay", type=float, required=True, help="lay odds (shortened price, later)")
    lk.add_argument("--stake", type=float, default=None, help="back stake (if not solving for --target)")
    lk.add_argument("--target", type=float, default=None, help="desired guaranteed profit (solves back stake)")
    lk.set_defaults(fn=cmd_lock)
    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
