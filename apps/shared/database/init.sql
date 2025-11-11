-- Arqos Database Schema
-- This file initializes the database with all necessary schemas and tables

-- Create schemas
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS exchanges;
CREATE SCHEMA IF NOT EXISTS portfolio;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS coinbase;
CREATE SCHEMA IF NOT EXISTS scheduler;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users and Authentication
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Exchange configurations
CREATE TABLE IF NOT EXISTS exchanges.exchange_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    exchange_name VARCHAR(50) NOT NULL,
    api_key VARCHAR(500),
    api_secret VARCHAR(500),
    config_data JSONB,  -- Additional exchange-specific configuration (e.g., file paths, settings)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, exchange_name)
);

-- Portfolio summary view (will be populated by triggers/views)
CREATE TABLE IF NOT EXISTS portfolio.summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    total_value_usd DECIMAL(20,8),
    total_cost_basis_usd DECIMAL(20,8),
    total_pnl_usd DECIMAL(20,8),
    total_pnl_percentage DECIMAL(10,4),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Analytics tables
CREATE TABLE IF NOT EXISTS analytics.daily_performance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    portfolio_value_usd DECIMAL(20,8),
    daily_change_usd DECIMAL(20,8),
    daily_change_percentage DECIMAL(10,4),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
);

-- Import History Table
-- Tracks historical import executions across all importers (coinbase, binance, etc.)
-- This table is importer-agnostic and stores statistics for each import run
CREATE TABLE IF NOT EXISTS analytics.import_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    importer_name VARCHAR(50) NOT NULL,  -- e.g., 'coinbase', 'binance', etc.
    source VARCHAR(50) NOT NULL,  -- e.g., 'app', 'pro', 'all', 'spot', 'futures', etc.
    status VARCHAR(20) NOT NULL,  -- 'success', 'failed', 'running'
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    execution_time_seconds DECIMAL(10,3),  -- Execution time in seconds (calculated from start_time and end_time)
    rows_imported INTEGER DEFAULT 0,  -- Total number of rows imported across all tables
    error_message TEXT,  -- Error message if status is 'failed'
    metadata JSONB,  -- Additional metadata (e.g., tables imported, file paths, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for import_history table
CREATE INDEX IF NOT EXISTS idx_import_history_user_id ON analytics.import_history(user_id);
CREATE INDEX IF NOT EXISTS idx_import_history_importer ON analytics.import_history(importer_name);
CREATE INDEX IF NOT EXISTS idx_import_history_source ON analytics.import_history(source);
CREATE INDEX IF NOT EXISTS idx_import_history_status ON analytics.import_history(status);
CREATE INDEX IF NOT EXISTS idx_import_history_start_time ON analytics.import_history(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_import_history_user_importer ON analytics.import_history(user_id, importer_name);
CREATE INDEX IF NOT EXISTS idx_import_history_user_start_time ON analytics.import_history(user_id, start_time DESC);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_exchange_configs_user_id ON exchanges.exchange_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_summary_user_id ON portfolio.summary(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_performance_user_date ON analytics.daily_performance(user_id, date);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers (idempotent)
DROP TRIGGER IF EXISTS update_users_updated_at ON auth.users;
CREATE TRIGGER update_users_updated_at 
BEFORE UPDATE ON auth.users 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_exchange_configs_updated_at ON exchanges.exchange_configs;
CREATE TRIGGER update_exchange_configs_updated_at 
BEFORE UPDATE ON exchanges.exchange_configs 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Coinbase Data Tables

-- Coinbase App Accounts Raw
-- Stores raw account information from Coinbase App (JSON data for flexibility)
-- Partitioned by HASH(import_id) for better query performance and data management
CREATE TABLE IF NOT EXISTS coinbase.coinbase_app_accounts_raw (
    id SERIAL,
    import_id UUID NOT NULL REFERENCES analytics.import_history(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    ingestion_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    PRIMARY KEY (id, import_id)
) PARTITION BY HASH (import_id);

-- Coinbase App Transactions Raw
-- Stores raw transaction data from Coinbase App (JSON data for flexibility)
-- Partitioned by HASH(import_id) for better query performance and data management
CREATE TABLE IF NOT EXISTS coinbase.coinbase_app_transactions_raw (
    id SERIAL,
    import_id UUID NOT NULL REFERENCES analytics.import_history(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    ingestion_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    PRIMARY KEY (id, import_id)
) PARTITION BY HASH (import_id);

-- Coinbase Pro Accounts
-- Stores account information from Coinbase Pro (CSV import)
-- Partitioned by HASH(import_id) for better query performance and data management
CREATE TABLE IF NOT EXISTS coinbase.coinbase_pro_accounts (
    id SERIAL,
    import_id UUID NOT NULL REFERENCES analytics.import_history(id) ON DELETE CASCADE,
    portfolio VARCHAR(100),
    type VARCHAR(50),
    time TIMESTAMP WITH TIME ZONE,
    amount DECIMAL(20,8),
    balance DECIMAL(20,8),
    amount_balance_unit VARCHAR(10),
    transfer_id VARCHAR(100),
    trade_id VARCHAR(100),
    order_id VARCHAR(100),
    ingestion_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    PRIMARY KEY (id, import_id)
) PARTITION BY HASH (import_id);

-- Coinbase Pro Fills (Trades)
-- Stores fill/trade data from Coinbase Pro (CSV import)
-- Partitioned by HASH(import_id) for better query performance and data management
CREATE TABLE IF NOT EXISTS coinbase.coinbase_pro_fills (
    id SERIAL,
    import_id UUID NOT NULL REFERENCES analytics.import_history(id) ON DELETE CASCADE,
    portfolio VARCHAR(100),
    trade_id VARCHAR(100),
    product VARCHAR(50),
    side VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE,
    size DECIMAL(20,8),
    size_unit VARCHAR(10),
    price DECIMAL(20,8),
    fee DECIMAL(20,8),
    total DECIMAL(20,8),
    price_fee_total_unit VARCHAR(10),
    ingestion_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    PRIMARY KEY (id, import_id)
) PARTITION BY HASH (import_id);

-- Create hash partitions for coinbase_app_accounts_raw (4 partitions)
DO $$
BEGIN
    FOR i IN 0..3 LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS coinbase.coinbase_app_accounts_raw_%s
             PARTITION OF coinbase.coinbase_app_accounts_raw
             FOR VALUES WITH (modulus 4, remainder %s)',
            i, i
        );
    END LOOP;
END $$;

-- Create hash partitions for coinbase_app_transactions_raw (4 partitions)
DO $$
BEGIN
    FOR i IN 0..3 LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS coinbase.coinbase_app_transactions_raw_%s
             PARTITION OF coinbase.coinbase_app_transactions_raw
             FOR VALUES WITH (modulus 4, remainder %s)',
            i, i
        );
    END LOOP;
END $$;

-- Create hash partitions for coinbase_pro_accounts (4 partitions)
DO $$
BEGIN
    FOR i IN 0..3 LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS coinbase.coinbase_pro_accounts_%s
             PARTITION OF coinbase.coinbase_pro_accounts
             FOR VALUES WITH (modulus 4, remainder %s)',
            i, i
        );
    END LOOP;
END $$;

-- Create hash partitions for coinbase_pro_fills (4 partitions)
DO $$
BEGIN
    FOR i IN 0..3 LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS coinbase.coinbase_pro_fills_%s
             PARTITION OF coinbase.coinbase_pro_fills
             FOR VALUES WITH (modulus 4, remainder %s)',
            i, i
        );
    END LOOP;
END $$;

-- Coinbase App Accounts (Desencapsulated)
-- Stores desencapsulated account information from Coinbase App raw data
-- This table will be populated by processing coinbase_app_accounts_raw
CREATE TABLE IF NOT EXISTS coinbase.coinbase_app_accounts (
    id SERIAL PRIMARY KEY,
    import_id UUID NOT NULL REFERENCES analytics.import_history(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Desencapsulated fields from raw data JSON
    uuid UUID NOT NULL,
    name VARCHAR(255),
    currency VARCHAR(10),
    available_balance_value DECIMAL(20,8),
    available_balance_currency VARCHAR(10),
    is_default BOOLEAN,
    is_active BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    account_type VARCHAR(50),
    is_ready BOOLEAN,
    hold_value DECIMAL(20,8),
    hold_currency VARCHAR(10),
    retail_portfolio_id UUID,
    platform VARCHAR(50),
    ingestion_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Coinbase App Transactions (Desencapsulated)
-- Stores desencapsulated transaction information from Coinbase App raw data
-- This table will be populated by processing coinbase_app_transactions_raw
CREATE TABLE IF NOT EXISTS coinbase.coinbase_app_transactions (
    id SERIAL PRIMARY KEY,
    import_id UUID NOT NULL REFERENCES analytics.import_history(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Desencapsulated fields from raw data JSON
    transaction_id UUID NOT NULL,
    transaction_type VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50),
    resource VARCHAR(50),
    resource_path TEXT,
    -- Amount fields
    amount_value DECIMAL(20,8),
    amount_currency VARCHAR(10),
    native_amount_value DECIMAL(20,8),
    native_amount_currency VARCHAR(10),
    -- Advanced trade fill fields (nullable, only for advanced_trade_fill type)
    advanced_trade_fill_commission DECIMAL(20,8),
    advanced_trade_fill_price DECIMAL(20,8),
    advanced_trade_fill_order_id UUID,
    advanced_trade_fill_order_side VARCHAR(10),
    advanced_trade_fill_product_id VARCHAR(50),
    ingestion_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for Coinbase raw tables (partitioned)
CREATE INDEX IF NOT EXISTS idx_coinbase_app_accounts_raw_import_id ON coinbase.coinbase_app_accounts_raw(import_id);
CREATE INDEX IF NOT EXISTS idx_coinbase_app_accounts_raw_user_id ON coinbase.coinbase_app_accounts_raw(user_id);
CREATE INDEX IF NOT EXISTS idx_coinbase_app_accounts_raw_ingestion ON coinbase.coinbase_app_accounts_raw(ingestion_time);
CREATE INDEX IF NOT EXISTS idx_coinbase_app_transactions_raw_import_id ON coinbase.coinbase_app_transactions_raw(import_id);
CREATE INDEX IF NOT EXISTS idx_coinbase_app_transactions_raw_user_id ON coinbase.coinbase_app_transactions_raw(user_id);
CREATE INDEX IF NOT EXISTS idx_coinbase_app_transactions_raw_ingestion ON coinbase.coinbase_app_transactions_raw(ingestion_time);
CREATE INDEX IF NOT EXISTS idx_coinbase_pro_accounts_import_id ON coinbase.coinbase_pro_accounts(import_id);
CREATE INDEX IF NOT EXISTS idx_coinbase_pro_accounts_user_id ON coinbase.coinbase_pro_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_coinbase_pro_accounts_time ON coinbase.coinbase_pro_accounts(time);
CREATE INDEX IF NOT EXISTS idx_coinbase_pro_fills_import_id ON coinbase.coinbase_pro_fills(import_id);
CREATE INDEX IF NOT EXISTS idx_coinbase_pro_fills_user_id ON coinbase.coinbase_pro_fills(user_id);
CREATE INDEX IF NOT EXISTS idx_coinbase_pro_fills_created_at ON coinbase.coinbase_pro_fills(created_at);

-- Create indexes for Coinbase desencapsulated tables
CREATE INDEX IF NOT EXISTS idx_coinbase_app_accounts_import_id ON coinbase.coinbase_app_accounts(import_id);
CREATE INDEX IF NOT EXISTS idx_coinbase_app_accounts_user_id ON coinbase.coinbase_app_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_coinbase_app_accounts_uuid ON coinbase.coinbase_app_accounts(uuid);
CREATE INDEX IF NOT EXISTS idx_coinbase_app_transactions_import_id ON coinbase.coinbase_app_transactions(import_id);
CREATE INDEX IF NOT EXISTS idx_coinbase_app_transactions_user_id ON coinbase.coinbase_app_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_coinbase_app_transactions_transaction_id ON coinbase.coinbase_app_transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_coinbase_app_transactions_type ON coinbase.coinbase_app_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_coinbase_app_transactions_created_at ON coinbase.coinbase_app_transactions(created_at);

-- Scheduler Configuration Tables
-- Stores scheduled import jobs for different importers
CREATE TABLE IF NOT EXISTS scheduler.import_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    importer_name VARCHAR(50) NOT NULL,  -- e.g., 'coinbase'
    source VARCHAR(50) NOT NULL,  -- e.g., 'app', 'pro', 'all'
    enabled BOOLEAN DEFAULT true,
    cron_expression VARCHAR(100) NOT NULL,  -- Cron expression for scheduling
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,
    last_run_status VARCHAR(20),  -- 'success', 'failed', 'running'
    last_run_error TEXT,
    UNIQUE(user_id, importer_name, source)
);

-- Indexes for scheduler tables
CREATE INDEX IF NOT EXISTS idx_import_jobs_user_id ON scheduler.import_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_enabled ON scheduler.import_jobs(enabled);
CREATE INDEX IF NOT EXISTS idx_import_jobs_next_run ON scheduler.import_jobs(next_run_at) WHERE enabled = true;

-- Alerts Table
-- Stores user-defined alerts for price, balance, and transaction monitoring
CREATE TABLE IF NOT EXISTS analytics.alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,  -- 'price', 'balance', 'transaction'
    asset VARCHAR(50),  -- Asset symbol (e.g., 'BTC', 'ETH') or 'Portfolio' for balance alerts
    condition VARCHAR(20) NOT NULL,  -- 'Above', 'Below', 'Equals'
    value DECIMAL(20,8),  -- Threshold value
    value_currency VARCHAR(10),  -- Currency for the value (e.g., 'USD', 'BTC')
    status VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active', 'triggered', 'inactive'
    triggered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for alerts table
CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON analytics.alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON analytics.alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON analytics.alerts(type);
CREATE INDEX IF NOT EXISTS idx_alerts_user_status ON analytics.alerts(user_id, status);

-- Apply updated_at trigger to alerts
DROP TRIGGER IF EXISTS update_alerts_updated_at ON analytics.alerts;
CREATE TRIGGER update_alerts_updated_at 
BEFORE UPDATE ON analytics.alerts 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Unified Transactions View
-- Combines transactions from all exchanges into a single view for easy querying
CREATE OR REPLACE VIEW analytics.unified_transactions AS
-- Coinbase App Transactions
SELECT 
    'coinbase_app' as exchange,
    'app' as source,
    id::text as transaction_id,
    transaction_type as type,
    created_at as date,
    amount_value as amount,
    amount_currency as asset,
    native_amount_value as total_usd,
    native_amount_currency as total_currency,
    user_id,
    ingestion_time
FROM coinbase.coinbase_app_transactions
WHERE transaction_type IN ('send', 'receive', 'buy', 'sell', 'trade', 'advanced_trade_fill', 'fiat_deposit', 'fiat_withdrawal')
UNION ALL
-- Coinbase Pro Fills (Trades)
SELECT 
    'coinbase_pro' as exchange,
    'pro' as source,
    trade_id as transaction_id,
    CASE 
        WHEN side = 'BUY' THEN 'buy'
        WHEN side = 'SELL' THEN 'sell'
        ELSE 'trade'
    END as type,
    created_at as date,
    size as amount,
    SPLIT_PART(product, '-', 1) as asset,  -- Extract base currency from product (e.g., 'BTC-USD' -> 'BTC')
    total as total_usd,
    price_fee_total_unit as total_currency,
    user_id,
    ingestion_time
FROM coinbase.coinbase_pro_fills;

-- Create default admin user and print its ID + password
DO $$
DECLARE
    v_user_id   uuid;
    v_password  text;
BEGIN
    -- Only create if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE username = 'admin') THEN
        v_password := uuid_generate_v4()::text;  -- random plain password

        INSERT INTO auth.users (username, email, password_hash, first_name, last_name, is_active)
        VALUES (
            'admin',
            'admin@arqos.com',
            crypt(v_password, gen_salt('bf')),
            'Admin',
            'User',
            true
        )
        RETURNING id INTO v_user_id;

        RAISE NOTICE 'Admin user created. ID: %, username: admin, password: %', v_user_id, v_password;
    ELSE
        SELECT id INTO v_user_id FROM auth.users WHERE username = 'admin';
        RAISE NOTICE 'Admin user already exists. ID: %, username: admin', v_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql;