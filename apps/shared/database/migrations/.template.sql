-- migrate:up
-- Description: What this migration does
-- 
-- Example migration that adds a new table
CREATE TABLE IF NOT EXISTS schema.table_name (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_table_name_name ON schema.table_name(name);

-- migrate:down
-- Rollback: Remove the table and index
DROP INDEX IF EXISTS schema.idx_table_name_name;
DROP TABLE IF EXISTS schema.table_name;

