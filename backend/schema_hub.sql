-- Marswalk Hub Database Schema
-- Provides tables for Mission Presets, Multi-phase Checklists, State Tracking, and Hold Criteria.
-- Compatible with SQLite, PostgreSQL, and MySQL.

PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------------------------
-- 1. MISSION PRESETS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mission_presets (
    id VARCHAR(32) PRIMARY KEY,                 -- e.g. 'EVA-07'
    name VARCHAR(128) NOT NULL,                 -- e.g. 'Jezero West Delta'
    site VARCHAR(128) NOT NULL,                 -- e.g. 'Jezero Crater West'
    sol INTEGER NOT NULL,                       -- e.g. 412
    coordinates VARCHAR(64) NOT NULL,           -- e.g. '18.44° N, 77.43° E'
    mode VARCHAR(32) NOT NULL,                  -- 'efficient' | 'balanced' | 'safest'
    policy_id VARCHAR(64) NOT NULL,             -- 'engine' | 'hold-sheet'
    science_id VARCHAR(64) NOT NULL,            -- 'app-50kg' | 'model-40kg'
    start_lmst REAL NOT NULL,                   -- e.g. 9.0 (hours)
    distance_km REAL NOT NULL,                  -- e.g. 3.4
    duration_label VARCHAR(64) NOT NULL,        -- e.g. '3 h 10 min'
    stops_count INTEGER NOT NULL,               -- e.g. 6
    summary TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'Planned', -- 'Active' | 'Ready' | 'Planned'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mission_preset_tags (
    preset_id VARCHAR(32) NOT NULL,
    tag VARCHAR(64) NOT NULL,
    PRIMARY KEY (preset_id, tag),
    FOREIGN KEY (preset_id) REFERENCES mission_presets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mission_presets_status ON mission_presets(status);
CREATE INDEX IF NOT EXISTS idx_mission_presets_mode ON mission_presets(mode);

-- -----------------------------------------------------------------------------
-- 2. CHECKLISTS (Phases: Pre-EVA, During-EVA, Post-EVA, or Custom)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checklists (
    id VARCHAR(32) PRIMARY KEY,                 -- 'pre' | 'during' | 'post' | custom id
    title VARCHAR(128) NOT NULL,                -- e.g. 'Pre-EVA checklist'
    phase VARCHAR(32) NOT NULL,                 -- 'pre' | 'during' | 'post' | 'custom'
    is_builtin BOOLEAN NOT NULL DEFAULT 1,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 3. CHECKLIST BLOCKS (Sections within a checklist)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checklist_blocks (
    id VARCHAR(64) PRIMARY KEY,                 -- e.g. 'pre-1', 'during-1', 'post-1'
    checklist_id VARCHAR(32) NOT NULL,
    title VARCHAR(128) NOT NULL,                -- e.g. 'Plan and route'
    when_window VARCHAR(64),                    -- e.g. 'T−24 h', 'T+0 to T+1 h'
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_checklist_blocks_checklist ON checklist_blocks(checklist_id, sort_order);

-- -----------------------------------------------------------------------------
-- 4. CHECKLIST ITEMS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checklist_items (
    id VARCHAR(64) PRIMARY KEY,                 -- e.g. 'pre-1.1', 'during-1', 'post-1.1'
    block_id VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,                -- e.g. 'Objectives and timeline'
    detail TEXT,                                -- Pass condition / check threshold
    owner VARCHAR(32),                          -- 'Auto' | 'Auto+' | 'Crew' | 'IV' | 'Med' | 'Suit'
    tag VARCHAR(64),                            -- Timestamp or optional label, e.g. '00:05'
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (block_id) REFERENCES checklist_blocks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS checklist_item_codes (
    item_id VARCHAR(64) NOT NULL,
    code VARCHAR(32) NOT NULL,                  -- Taxonomy variable code, e.g. 'EB12', 'ED28'
    PRIMARY KEY (item_id, code),
    FOREIGN KEY (item_id) REFERENCES checklist_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_checklist_items_block ON checklist_items(block_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_checklist_items_owner ON checklist_items(owner);
CREATE INDEX IF NOT EXISTS idx_checklist_item_codes_code ON checklist_item_codes(code);

-- -----------------------------------------------------------------------------
-- 5. CHECKLIST STATE (Per Mission Preset)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mission_checklist_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    preset_id VARCHAR(32) NOT NULL,
    item_id VARCHAR(64) NOT NULL,
    is_done BOOLEAN NOT NULL DEFAULT 0,
    completed_at TIMESTAMP,
    completed_by VARCHAR(64),
    notes TEXT,
    UNIQUE (preset_id, item_id),
    FOREIGN KEY (preset_id) REFERENCES mission_presets(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES checklist_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mission_checklist_state_preset ON mission_checklist_state(preset_id);
CREATE INDEX IF NOT EXISTS idx_mission_checklist_state_item ON mission_checklist_state(item_id);

-- -----------------------------------------------------------------------------
-- 6. HOLD & ABORT CRITERIA
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hold_criteria (
    id VARCHAR(64) PRIMARY KEY,                 -- e.g. 'hold-aerobic'
    title VARCHAR(128) NOT NULL,                -- e.g. 'Aerobic capacity'
    limit_expr TEXT NOT NULL,                   -- e.g. 'VO2peak >= 36.5 mL/kg/min'
    status VARCHAR(32) NOT NULL,                -- 'sourced' | 'margin' | 'rule'
    source TEXT NOT NULL,                       -- e.g. 'Sourced (NASA partial-g EVA standard)'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hold_criteria_codes (
    criteria_id VARCHAR(64) NOT NULL,
    code VARCHAR(32) NOT NULL,                  -- e.g. 'IB1'
    PRIMARY KEY (criteria_id, code),
    FOREIGN KEY (criteria_id) REFERENCES hold_criteria(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hold_criteria_codes_code ON hold_criteria_codes(code);
