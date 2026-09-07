"""Low-level math engine (pure functions, stdlib only).

Mirrors src/engine/harmony.ts + books.ts semantics exactly:
  fin  = (prod q_i) * (1 + min(bonus_b(N), cap)/100)
  s*   = (S + B + T) / (fin - 1)
  s    = ROUNDUP(max(s*, min_stake)) to 0.50, floor 1.00

Rounding parity note: r2() uses float formatting (same binary value in,
same 2-decimal rounding out as JS Number(x.toFixed(2))). Stakes are exact
0.50 multiples on both sides. Tests use tolerances for products.
"""

from __future__ import annotations

import math

from .model import BONUS_TABLE, MAIN_BOOK


def r2(x: float) -> float:
    return float(f"{x:.2f}")


def ceil_step(x: float, step: float = 0.5) -> float:
    return math.ceil(x / step - 1e-9) * step


def round_stake(x: float, min_stake: float = 1.0) -> float:
    return r2(max(1.0, ceil_step(max(x, min_stake))))


def bonus_for_n(n: int, table=None, cap: float = 500.0) -> float:
    if n < 5:
        return 0.0
    t = table if table is not None else BONUS_TABLE
    return min(float(t.get(n, 0.0)), cap)


def bonus_for_book(book: dict, n: int) -> float:
    return bonus_for_n(n, book.get("bonus_table"), book.get("bonus_cap", 500.0))


def size_ticket(legs, spent: float, target: float = 45.0, bleed: float = 0.0,
                book: dict | None = None, min_stake: float = 1.0) -> dict:
    """Size one ticket. legs = [{'odds': q, 'market': 'OVER'|'UNDER'}]."""
    b = book or MAIN_BOOK
    n = len(legs)
    raw = math.prod([float(l["odds"]) for l in legs]) if n else 0.0
    bonus = bonus_for_book(b, n)
    finale = raw * (1 + bonus / 100)
    if n < 1 or not finale > 1:
        return {"legs": legs, "n": n, "raw": raw, "bonus": bonus, "finale": finale,
                "stake_neutral": 0.0, "stake": 0.0, "lordo": 0.0,
                "netto_no_bleed": 0.0, "feasible": False}
    neutral = (spent + bleed + target) / (finale - 1)
    stake = round_stake(neutral, min_stake)
    lordo = r2(stake * finale)
    return {"legs": legs, "n": n, "raw": raw, "bonus": bonus, "finale": finale,
            "stake_neutral": r2(neutral), "stake": stake, "lordo": lordo,
            "netto_no_bleed": r2(lordo - (spent + stake)), "feasible": True}


def target_for_depth(base: float, rho: float, spent: float, t_max: float) -> float:
    desired = max(base, rho * spent)
    if not t_max >= 0:
        return 0.0
    return min(desired, t_max)


def bankroll_tbr(bankroll: float, tau: float = 0.015) -> float:
    return r2(max(0.0, tau * bankroll))


def max_concurrent(bankroll: float, worst_cost: float, factor: int = 2,
                   op_cap: int = 6) -> tuple[int, float]:
    if not bankroll > 0 or not worst_cost > 0:
        return 0, 0.0
    n = max(0, min(op_cap, math.floor(bankroll / (factor * worst_cost))))
    return n, r2(n * worst_cost / bankroll)


def lock_spend_limit(s_cap: float, lock_fin: float, target: float, bleed: float) -> float:
    return r2(s_cap * (lock_fin - 1) - target - bleed)


def void_recompute(legs: list, void_index: int, book: dict | None = None) -> dict:
    b = book or MAIN_BOOK
    kept = [l for i, l in enumerate(legs) if i != void_index]
    n = len(kept)
    raw = math.prod([float(l["odds"]) for l in kept]) if n else 0.0
    bonus = bonus_for_book(b, n)
    return {"legs": kept, "n": n, "raw": raw, "bonus": bonus,
            "finale": raw * (1 + bonus / 100) if n >= 1 else 0.0}


def expected_bleed(later_stakes: list, reach_p: float = 0.6944) -> float:
    b, p = 0.0, 1.0
    for s in later_stakes:
        p *= reach_p
        b += p * s
    return r2(b)


def build_chain(n_mother: int = 30, under: float = 1.32, over: float = 3.0,
                s0: float = 2.0, target_base: float = 45.0, rho: float = 0.0,
                book: dict | None = None, lock_odds: float = 2.75,
                s_cap: float = 150.0, budget: float = math.inf) -> dict:
    """Mother (all Under) + Over-first coverages + lock. Neutral sizing +
    worst-case TRUE-netto audit. Returns rows, feasible flag, min_true."""
    b = book or MAIN_BOOK
    unders = [under] * n_mother
    drafts: list[dict] = [{"kind": "MOTHER",
                           "legs": [{"odds": u, "market": "UNDER"} for u in unders],
                           "policy": s0}]
    for k in range(1, n_mother):
        # after k confirmed Unders: Over@next + Unders after it
        rest = unders[k + 1:]
        drafts.append({"kind": "COVERAGE",
                       "legs": [{"odds": over, "market": "OVER"}] +
                               [{"odds": u, "market": "UNDER"} for u in rest]})
    drafts.append({"kind": "LOCK", "legs": [{"odds": lock_odds, "market": "OVER"}]})

    spent = 0.0
    for d in drafts:
        legs, n = d["legs"], len(d["legs"])
        raw = math.prod([float(l["odds"]) for l in legs])
        bonus = bonus_for_book(b, n)
        finale = raw * (1 + bonus / 100)
        target = max(target_base, rho * spent)
        if "policy" in d:
            d["stake"] = d["policy"]
        else:
            d["stake"] = round_stake((spent + target) / (finale - 1)) if finale > 1 else 0.0
        d.update(n=n, raw=raw, bonus=bonus, finale=finale)
        spent = r2(spent + d["stake"])

    rows, spent_cum, total = [], 0.0, spent
    for i, d in enumerate(drafts):
        spent_cum = r2(spent_cum + d["stake"])
        lordo = r2(d["stake"] * d["finale"])
        rows.append({"index": i, "kind": d["kind"], "n": d["n"],
                     "raw": r2(d["raw"]), "bonus": d["bonus"], "finale": r2(d["finale"]),
                     "stake": d["stake"], "spent_cum": spent_cum, "lordo": lordo,
                     "netto_no_bleed": r2(lordo - spent_cum),
                     "true_netto": r2(lordo - total),
                     "feasible": d["stake"] > 0 and d["stake"] <= s_cap and spent_cum <= budget})
    return {"rows": rows, "feasible": all(r["feasible"] for r in rows),
            "min_true": r2(min(r["true_netto"] for r in rows))}


def select_best_book(books: list, legs: list) -> dict | None:
    """Pick the eligible book maximizing finale. One ticket = one book."""
    n = len(legs)
    if n < 1:
        return None
    has_over = any(l.get("market") == "OVER" for l in legs)
    best = None
    for bk in books:
        if not bk.get("is_active", True):
            continue
        if n > bk.get("max_legs", 30):
            continue
        if has_over and not bk.get("over_eligible", True):
            continue
        raw = math.prod([float(l["odds"]) for l in legs])
        bonus = bonus_for_book(bk, n)
        finale = raw * (1 + bonus / 100)
        if best is None or finale > best["finale"]:
            best = {"book": bk, "raw": raw, "bonus": bonus, "finale": finale}
    return best


def resolve_fallback(candidates: list, spent: float, bleed: float = 0.0,
                     target_base: float = 45.0, rho: float = 0.0,
                     min_stake: float = 1.0, s_cap: float = 150.0,
                     budget: float = math.inf) -> dict | None:
    """First feasible plan wins (full T/N -> reduced T -> lock). None = stop."""
    for c in candidates:
        book = c.get("book") or MAIN_BOOK
        legs, n = c["legs"], len(c["legs"])
        raw = math.prod([float(l["odds"]) for l in legs]) if n else 0.0
        bonus = bonus_for_book(book, n)
        finale = raw * (1 + bonus / 100)
        if n < 1 or not finale > 1:
            continue
        t_max = s_cap * (finale - 1) - spent - bleed
        target = target_for_depth(max(target_base, rho * spent), rho, spent, t_max)
        if target < 0:
            continue
        s = size_ticket(legs, spent, target, bleed, book, min_stake)
        if not s["feasible"] or s["stake"] > s_cap or spent + s["stake"] > budget:
            continue
        return {**s, "label": c.get("label", ""), "target": target}
    return None


def portfolio_exposure(ledgers: list) -> float:
    return r2(sum(float(l["spent"]) for l in ledgers))


def can_open_cycle(bankroll: float, worst_cost: float, active: list,
                   factor: int = 2, op_cap: int = 6) -> dict:
    n_max, _ = max_concurrent(bankroll, worst_cost, factor, op_cap)
    if len(active) >= n_max:
        return {"ok": False, "reason": f"max {n_max} cicli concorrenti"}
    if portfolio_exposure(active) + worst_cost > bankroll:
        return {"ok": False, "reason": "tetto bankroll superato"}
    return {"ok": True, "reason": "ok"}
