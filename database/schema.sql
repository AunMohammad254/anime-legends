CREATE TABLE IF NOT EXISTS game_progress (
    key_hash text PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    progress jsonb NOT NULL CHECK (jsonb_typeof(progress) = 'object')
);

-- The server connects as the owner. Other roles, including anonymous clients
-- on hosts that expose public tables through a data API, have no row policy.
ALTER TABLE game_progress ENABLE ROW LEVEL SECURITY;
