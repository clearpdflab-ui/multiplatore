"""Parity tests: same validated numbers as TS engine + Excel model."""
import math

import pytest

from pyengine import core as C
from pyengine.model import BONUS_TABLE, MAIN_BOOK

U = lambda q=1.32: {"odds": q, "market": "UNDER"}  # noqa: E731
O = lambda q=3.0: {"odds": q, "market": "OVER"}  # noqa: E731


def test_table_spots():
    assert BONUS_TABLE[30] == 354.9
    assert BONUS_TABLE[15] == 89.8
    assert BONUS_TABLE[9] == 33.8
    assert BONUS_TABLE[8] == 26.2
    assert C.bonus_for_n(4) == 0.0


def test_rounding():
    assert C.r2(0.1 + 0.2) == 0.3
    assert C.round_stake(0.24) == 1.0
    assert C.round_stake(1.44) == 1.5
    assert C.round_stake(2.0) == 2.0


def test_mother_15_finale():
    legs = [U() for _ in range(15)]
    t = C.size_ticket(legs, spent=0.0, target=0.0)
    assert t["finale"] == pytest.approx(122.15, abs=0.01)


def test_c1_over_first():
    legs = [O()] + [U() for _ in range(13)]  # N=14
    t = C.size_ticket(legs, spent=2.0, target=45.0)
    assert t["n"] == 14
    assert t["finale"] == pytest.approx(198.46, abs=0.01)
    assert t["stake"] == 1.0
    assert t["lordo"] - (2.0 + t["stake"]) >= 45.0  # M2 rollover


def test_chain_15_structure_and_recovery():
    res = C.build_chain(n_mother=15, s0=2.0)
    rows = res["rows"]
    assert len(rows) == 16  # mother + 14 coverages + lock
    assert rows[0]["kind"] == "MOTHER" and rows[-1]["kind"] == "LOCK"
    assert rows[1]["n"] == 14
    for r in rows:
        assert r["netto_no_bleed"] >= 45.0 - 1e-9
    assert res["feasible"] is True
    lock = rows[-1]
    assert lock["true_netto"] == lock["netto_no_bleed"]


def test_chain_30_mother_lottery():
    res = C.build_chain(n_mother=30, s0=2.0)
    rows = res["rows"]
    assert len(rows) == 31
    assert rows[0]["finale"] == pytest.approx(18842.3, abs=1.0)
    for r in rows:
        assert r["netto_no_bleed"] >= 45.0 - 1e-9


def test_bankroll_and_caps():
    assert C.bankroll_tbr(3000.0) == 45.0
    assert C.max_concurrent(3000.0, 450.0) == (3, 0.45)
    assert C.lock_spend_limit(150.0, 2.75, 45.0, 20.0) == pytest.approx(197.5)
    assert C.can_open_cycle(3000.0, 450.0, [])["ok"] is True
    assert C.can_open_cycle(3000.0, 450.0,
                            [{"spent": 400}] * 3)["ok"] is False


def test_void_and_fallback_and_books():
    legs = [O()] + [U() for _ in range(11)]  # N=12
    v = C.void_recompute(legs, 0)
    assert v["n"] == 11 and v["bonus"] == 50.4
    lock = C.resolve_fallback(
        [{"label": "nope", "legs": [{"odds": 1.0}]},
         {"label": "lock", "legs": [{"odds": 2.75, "market": "OVER"}]}],
        spent=50.0)
    assert lock and lock["label"] == "lock"
    assert C.resolve_fallback(
        [{"label": "x", "legs": [{"odds": 1.0}]}], spent=10.0) is None
    low = dict(MAIN_BOOK, id="low", name="Low",
               bonus_table={**MAIN_BOOK["bonus_table"], 12: 10.0})
    best = C.select_best_book([low, MAIN_BOOK],
                              [U() for _ in range(12)])
    assert best and best["book"]["id"] == "main"
    small = dict(MAIN_BOOK, id="small", max_legs=10)
    assert C.select_best_book([small], [U() for _ in range(12)]) is None


def test_expected_bleed():
    assert C.expected_bleed([1.0, 1.0, 1.0]) == pytest.approx(1.51, abs=0.01)
    assert C.expected_bleed([]) == 0.0
    assert math.isfinite(C.expected_bleed([150.0] * 30))
