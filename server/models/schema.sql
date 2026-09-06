# Database Schema

-- Users
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Matches
CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    league_id TEXT,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    under_odds REAL NOT NULL,
    over_odds REAL NOT NULL,
    status TEXT DEFAULT 'PENDING',
    outcome TEXT,
    scheduled_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Generated Slips
CREATE TABLE IF NOT EXISTS slips (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    type TEXT NOT NULL,
    code TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING',
    stake REAL NOT NULL,
    final_multiplier REAL NOT NULL,
    potential_payout REAL,
    potential_profit REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Bet History (P&L tracking)
CREATE TABLE IF NOT EXISTS bet_history (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    slip_id TEXT,
    bet_type TEXT,
    stake REAL,
    result TEXT,
    payout REAL,
    profit_loss REAL,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (slip_id) REFERENCES slips(id)
);

-- Odds Cache
CREATE TABLE IF NOT EXISTS odds_cache (
    id TEXT PRIMARY KEY,
    league_id TEXT,
    match_id TEXT,
    under_odds REAL,
    over_odds REAL,
    bookmaker TEXT,
    cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User Settings
CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    default_stake REAL DEFAULT 20,
    default_target_profit REAL DEFAULT 45,
    asymmetric_mode TEXT DEFAULT 'front_loaded',
    booster_enabled BOOLEAN DEFAULT 1,
    booster_odds REAL DEFAULT 1.10,
    bookmaker_model TEXT DEFAULT '132_300',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_matches_user ON matches(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_league ON matches(league_id);
CREATE INDEX IF NOT EXISTS idx_slips_user ON slips(user_id);
CREATE INDEX IF NOT EXISTS idx_bet_history_user ON bet_history(user_id);
