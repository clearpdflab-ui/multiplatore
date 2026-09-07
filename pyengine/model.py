"""Single source of truth: validated bonus table, books, policy defaults.

Mirrors src/engine/books.ts + Supabase book_bonus_versions seed.
Edit here (and ONLY here) when numbers change; both engines and tests read this.
"""

BONUS_TABLE = {
    5: 6.0, 6: 12.4, 7: 19.1, 8: 26.2, 9: 33.8,
    10: 41.9, 11: 50.4, 12: 59.4, 13: 68.9, 14: 79.1,
    15: 89.8, 16: 101.2, 17: 113.3, 18: 126.1, 19: 139.7,
    20: 154.0, 21: 169.3, 22: 185.4, 23: 202.6, 24: 220.7,
    25: 240.0, 26: 260.4, 27: 282.0, 28: 304.9, 29: 329.2,
    30: 354.9,
}

MAIN_BOOK = {
    "id": "main",
    "name": "Main",
    "bonus_table": dict(BONUS_TABLE),
    "bonus_cap": 500.0,
    "min_stake": 1.0,
    "max_payout": None,  # unlimited
    "max_legs": 30,
    "over_eligible": True,
    "competitions": ["all"],
    "is_active": True,
}

# Policy defaults (all bankroll-derived at runtime; these are the base values)
DEFAULTS = {
    "under": 1.32,
    "over": 3.00,
    "exchange": 2.75,
    "mother_n": 30,      # standard mother legs
    "s0": 2.0,           # mother stake (policy range 2-5)
    "t_base": 45.0,      # fallback target; live T comes from bankroll (tau)
    "tau": 0.015,        # T_br = tau * bankroll
    "rho": 0.0,          # target growth with depth (0 = flat within a cycle)
    "min_stake": 1.0,    # book floor
    "step": 0.5,         # rounding granularity
    "s_cap": 150.0,      # max single-ticket stake
    "reach_p": 0.6944,   # fair Under prob, EV bleed weighting
    "bankroll_factor": 2,
    "op_cap": 6,
}
