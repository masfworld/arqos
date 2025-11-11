# Coinbase Importer gRPC Service
***
## Description
gRPC service application to import data from Coinbase to PostgreSQL database. There are two different imports:
- **Coinbase Pro**: Before Coinbase Advanced Trade, Coinbase Pro was the tool to trade. Currently, this application is deprecated but you can download CSV files from [here](https://accounts.coinbase.com/statements/pro), then import it using this tool. CSV data is directly stored in structured tables.
- **Coinbase App**: The traditional Coinbase Application. It includes Coinbase Advanced Trade. Data is extracted from the API, stored in raw tables (JSON format), and automatically transformed into structured refined tables.

This service runs in gRPC-only mode and must be controlled remotely via gRPC commands.

### Data Processing Pipeline

**Coinbase App Import Flow:**
1. Extract data from Coinbase API (accounts and transactions)
2. Store raw JSON data in `coinbase_app_accounts_raw` and `coinbase_app_transactions_raw` tables
3. Automatically transform raw JSON data into structured format
4. Populate refined tables: `coinbase_app_accounts` and `coinbase_app_transactions`

**Coinbase Pro Import Flow:**
1. Read CSV files from configured folder paths
2. Parse and normalize CSV data
3. Store directly in structured tables: `coinbase_pro_accounts` and `coinbase_pro_fills`

## Dependencies:
- PostgreSQL database (with `exchanges.exchange_configs` table)
- [Coinbase Api Key](https://www.coinbase.com/settings/api) - configured via gRPC SetConfig, not .env
- Docker and Docker Compose (for easy setup)

## **Important: Configuration Management**

**Coinbase configuration is now stored in PostgreSQL database**, not in `.env` files. 

- **Exchange Configuration** (Coinbase API credentials, file paths, settings): Stored in `exchanges.exchange_configs` table, managed via gRPC `SetConfig`/`GetConfig` endpoints
- **Database Configuration** (PostgreSQL connection): Still configured via `.env` file (POSTGRES_* variables)

**Before starting imports**, you must configure Coinbase settings for each user using the `SetConfig` gRPC endpoint. Imports will fail if configuration doesn't exist for the user.


## **Setup**

### **1. Quick Setup with Docker Compose (Recommended)**

1. **Create environment file**
   ```bash
   cd apps/importers/coinbase
   cp .env.example .env
   ```

2. **Edit the `.env` file with your configuration**
   ```bash
   # Edit .env file with your Coinbase API credentials
   nano .env
   ```

3. **Start the services**
   ```bash
   # From project root, start coinbase importer with shared infrastructure
   ./scripts/docker-compose-run.sh coinbase up -d
   
   # Or using docker compose directly
   docker compose -f docker-compose.yml -f apps/importers/coinbase/docker-compose.yml up -d
   ```

   **Note**: The coinbase importer uses the shared PostgreSQL and Redis services from the root `docker-compose.yml`. Make sure infrastructure is running first:
   ```bash
   ./scripts/docker-compose-run.sh infrastructure up -d
   ```

### **2. Manual Setup (Alternative)**

#### **Install Dependencies Locally**
```bash
pip install poetry
poetry install
```

#### **Setup PostgreSQL Database**
1. Install PostgreSQL locally or use Docker:
   ```bash
   docker run --name arqos-postgres -e POSTGRES_DB=arqos -e POSTGRES_USER=arqos_user -e POSTGRES_PASSWORD=arqos_password -p 5433:5432 -d postgres:15-alpine
   ```

2. Create the schema:
   ```bash
   docker exec -i arqos-postgres psql -U arqos_user -d arqos < ../../shared/database/init.sql
   ```

#### **Setup Environment Variables**
Create a `.env` file with **only PostgreSQL database configuration**:

```env
# PostgreSQL Configuration (Required)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=arqos
POSTGRES_USER=arqos_user
POSTGRES_PASSWORD=arqos_password
POSTGRES_SCHEMA=coinbase
```

**Configuration Explanation:**

- **PostgreSQL Settings** (Required):
  - `POSTGRES_HOST`: PostgreSQL host (default: localhost).
  - `POSTGRES_PORT`: PostgreSQL port (default: 5432).
  - `POSTGRES_DATABASE`: Database name (default: arqos).
  - `POSTGRES_USER`: Database user (default: arqos_user).
  - `POSTGRES_PASSWORD`: Database password (default: arqos_password).
  - `POSTGRES_SCHEMA`: Database schema (default: coinbase). **Note**: The coinbase tables are created in the `coinbase` schema as defined in `init.sql`.

**Important**: Coinbase API credentials, file paths, and settings are **NOT** configured via `.env` files. They must be configured via gRPC `SetConfig` endpoint and are stored in the `exchanges.exchange_configs` PostgreSQL table. See the "Configuration Management" section below.

### **3. Start gRPC Service**

#### **Using Docker Compose**

**Prerequisites:**
1. Ensure shared infrastructure is running:
   ```bash
   ./scripts/docker-compose-run.sh infrastructure up -d
   ```
   At this point, a default `admin` user has been created. So, to check `user_id` and `password` for `admin`,  just execute the following command:
   ```bash
   docker logs arqos-postgres | grep "Admin user"
   ```

2. Generate gRPC code:
   ```bash
   docker compose -f docker-compose.yml -f apps/importers/coinbase/docker-compose.yml run --rm coinbase-importer python generate_grpc.py
   ```

3. Start the gRPC service:
   ```bash
   # Start the service in background
   docker compose -f docker-compose.yml -f apps/importers/coinbase/docker-compose.yml run -d --name coinbase-grpc coinbase-importer python main.py
   ```

#### **Using Local Installation**

**Prerequisites:**
1. **Install dependencies:**
   ```bash
   cd apps/importers/coinbase
   poetry install
   ```

2. **Start PostgreSQL in Docker (if not running locally):**
   Remember that PostgreSQL must be running 

3. **Create environment files:**
   ```bash
   # Create shared .env file
   cp ../../shared/.env.example ../../shared/.env
   # Edit with your PostgreSQL credentials
   
   # Create project .env file
   cp .env.example .env
   # Edit with your Coinbase API credentials
   ```

4. **Generate gRPC code:**
   ```bash
   poetry run python generate_grpc.py
   ```

**Start the gRPC service:**
```bash
# Activate poetry environment
poetry shell

# Run the gRPC service
poetry run python main.py
```

The service will start and listen on port 50051 for gRPC commands.

### **4. Database Access**

Connect to the PostgreSQL database to view your data:

```bash
# Using Docker (shared postgres container)
docker exec -it arqos-postgres psql -U arqos_user -d arqos

# Using local PostgreSQL
psql -h localhost -U arqos_user -d arqos
```

**Available Tables:**

**Raw Tables (JSON storage):**
- `coinbase.coinbase_app_accounts_raw`: Raw Coinbase App account data stored as JSON (includes `user_id` for data isolation)
- `coinbase.coinbase_app_transactions_raw`: Raw Coinbase App transaction data stored as JSON (includes `user_id` for data isolation)

**Refined Tables (Structured data):**
- `coinbase.coinbase_app_accounts`: Desencapsulated Coinbase App account data (includes `user_id` for data isolation)
- `coinbase.coinbase_app_transactions`: Desencapsulated Coinbase App transaction data (includes `user_id` for data isolation)
- `coinbase.coinbase_pro_accounts`: Coinbase Pro account data (includes `user_id` for data isolation)
- `coinbase.coinbase_pro_fills`: Coinbase Pro fill data (includes `user_id` for data isolation)

**Analytics Tables:**
- `analytics.import_history`: Historical import executions and statistics (importer-agnostic)

**Data Flow:**
1. **Coinbase App**: Data is extracted from the API → stored in raw tables (`coinbase_app_accounts_raw`, `coinbase_app_transactions_raw`) → automatically transformed → populated into refined tables (`coinbase_app_accounts`, `coinbase_app_transactions`)
2. **Coinbase Pro**: CSV files are processed → directly stored in refined tables (`coinbase_pro_accounts`, `coinbase_pro_fills`)

**Note**: All tables include a `user_id` column (UUID) that associates imported data with a specific user. This enables multi-user data isolation. The `user_id` must be provided when starting imports via gRPC.

#### **Import History Table**

The `analytics.import_history` table tracks all import executions across all importers (coinbase, binance, etc.). This table is **importer-agnostic** and stores comprehensive statistics for each import run.

**Table Schema:**
```sql
CREATE TABLE analytics.import_history (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    importer_name VARCHAR(50) NOT NULL,  -- e.g., 'coinbase', 'binance'
    source VARCHAR(50) NOT NULL,  -- e.g., 'app', 'pro', 'all'
    status VARCHAR(20) NOT NULL,  -- 'success', 'failed', 'running'
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    execution_time_seconds DECIMAL(10,3),
    rows_imported INTEGER DEFAULT 0,
    error_message TEXT,
    metadata JSONB,  -- Additional metadata (tables imported, file paths, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Fields:**
- `id`: Unique identifier for the import execution
- `user_id`: User who triggered the import
- `importer_name`: Name of the importer (e.g., 'coinbase', 'binance')
- `source`: Source type (e.g., 'app', 'pro', 'all', 'spot', 'futures')
- `status`: Execution status ('success', 'failed', 'running')
- `start_time`: When the import started
- `end_time`: When the import completed (NULL if still running)
- `execution_time_seconds`: Total execution time in seconds
- `rows_imported`: Total number of rows imported across all tables
- `error_message`: Error message if status is 'failed'
- `metadata`: JSONB field containing additional information:
  - For Coinbase App: `{tables: {coinbase_app_accounts_raw: N, coinbase_app_transactions_raw: M, coinbase_app_accounts: X, coinbase_app_transactions: Y}, source: 'app'}`
  - For Coinbase Pro: `{fills: {...}, accounts: {...}, source: 'pro'}`

**Indexes:**
- Indexed on `user_id`, `importer_name`, `source`, `status`, `start_time`
- Composite indexes for common queries: `(user_id, importer_name)`, `(user_id, start_time DESC)`

**Usage Examples:**
```sql
-- Get all import history for a user
SELECT * FROM analytics.import_history 
WHERE user_id = '123e4567-e89b-12d3-a456-426614174000' 
ORDER BY start_time DESC;

-- Get failed imports
SELECT * FROM analytics.import_history 
WHERE status = 'failed' 
ORDER BY start_time DESC;

-- Get import statistics by importer
SELECT 
    importer_name,
    COUNT(*) as total_imports,
    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
    SUM(rows_imported) as total_rows,
    AVG(execution_time_seconds) as avg_execution_time
FROM analytics.import_history
GROUP BY importer_name;

-- Get recent imports with metadata
SELECT 
    importer_name,
    source,
    status,
    rows_imported,
    execution_time_seconds,
    metadata->>'tables' as tables_imported
FROM analytics.import_history
WHERE user_id = '123e4567-e89b-12d3-a456-426614174000'
ORDER BY start_time DESC
LIMIT 10;
```

**Automatic Logging:**
- Import history is automatically logged when imports start and complete
- Each import execution creates a record in `import_history` with status 'running'
- On completion, the record is updated with end_time, execution_time, rows_imported, and status
- Failed imports include error_message in the record

### **5. Run Tests**

```bash
# Using Docker
docker compose -f docker-compose.yml -f apps/importers/coinbase/docker-compose.yml run --rm coinbase-importer poetry run pytest

# Using local installation
cd apps/importers/coinbase
poetry run pytest

# With coverage
poetry run coverage run -m pytest && poetry run coverage report -m
```

### **6. Cleanup**

```bash
# Stop and remove coinbase importer containers
./scripts/docker-compose-run.sh coinbase down

# Stop and remove all services including shared infrastructure
./scripts/docker-compose-run.sh coinbase down
./scripts/docker-compose-run.sh infrastructure down

# Remove volumes (this will delete all data)
docker compose -f docker-compose.yml -f apps/importers/coinbase/docker-compose.yml down -v
```

### **7. Controlling the Importer via gRPC**

The importer runs as a gRPC service that listens on port 50051. All control operations must be performed via gRPC commands.

#### **Test gRPC Service with grpcurl**

Install `grpcurl` for testing:
```bash
# macOS
brew install grpcurl

# Linux
go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest
```

Test the service:
```bash
# List available services
grpcurl -plaintext localhost:50051 list

# Get current configuration for a user (user_id is required)
grpcurl -plaintext -d '{"user_id": "123e4567-e89b-12d3-a456-426614174000"}' localhost:50051 coinbase_importer.ImporterService/GetConfig

# Example response (note: coinbase_api_secret is masked):
# {
#   "config": {
#     "coinbase_api_key": "your_api_key",
#     "coinbase_api_secret": "********",
#     "coinbase_pro_accounts_folder_path": "/path/to/accounts",
#     "coinbase_pro_fills_folder_path": "/path/to/fills",
#     "settings": {}
#   },
#   "success": true,
#   "message": "Configuration retrieved successfully"
# }

# Get current status for a user (user_id is required)
grpcurl -plaintext -d '{"user_id": "123e4567-e89b-12d3-a456-426614174000"}' localhost:50051 coinbase_importer.ImporterService/GetStatus

# Start import for Coinbase App (user_id is REQUIRED)
grpcurl -plaintext -d '{"source": "app", "user_id": "123e4567-e89b-12d3-a456-426614174000"}' localhost:50051 coinbase_importer.ImporterService/StartImport

# Start import for Coinbase Pro (user_id is REQUIRED)
grpcurl -plaintext -d '{"source": "pro", "user_id": "123e4567-e89b-12d3-a456-426614174000"}' localhost:50051 coinbase_importer.ImporterService/StartImport

# Start import for both sources (user_id is REQUIRED)
grpcurl -plaintext -d '{"source": "all", "user_id": "123e4567-e89b-12d3-a456-426614174000"}' localhost:50051 coinbase_importer.ImporterService/StartImport

# Note: If configuration doesn't exist for the user_id, the import will fail with an error message.
# You must configure Coinbase settings first using SetConfig before starting imports.

# Stop import for Coinbase App
grpcurl -plaintext -d '{"source": "app"}' localhost:50051 coinbase_importer.ImporterService/StopImport

# Stop import for Coinbase Pro
grpcurl -plaintext -d '{"source": "pro"}' localhost:50051 coinbase_importer.ImporterService/StopImport

# Stop import for both sources
grpcurl -plaintext -d '{"source": "all"}' localhost:50051 coinbase_importer.ImporterService/StopImport

# Set configuration for a user (user_id is REQUIRED)
# Full update - all fields
grpcurl -plaintext -d '{
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "config": {
    "coinbase_api_key": "your_api_key",
    "coinbase_api_secret": "your_api_secret",
    "coinbase_pro_accounts_folder_path": "/path/to/accounts",
    "coinbase_pro_fills_folder_path": "/path/to/fills",
    "settings": {}
  }
}' localhost:50051 coinbase_importer.ImporterService/SetConfig

# Partial update - only update API key
grpcurl -plaintext -d '{
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "config": {
    "coinbase_api_key": "new_api_key"
  }
}' localhost:50051 coinbase_importer.ImporterService/SetConfig

# Partial update - only update API secret
grpcurl -plaintext -d '{
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "config": {
    "coinbase_api_secret": "new_api_secret"
  }
}' localhost:50051 coinbase_importer.ImporterService/SetConfig

# Partial update - only update Coinbase Pro paths
grpcurl -plaintext -d '{
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "config": {
    "coinbase_pro_accounts_folder_path": "/new/path/to/accounts",
    "coinbase_pro_fills_folder_path": "/new/path/to/fills"
  }
}' localhost:50051 coinbase_importer.ImporterService/SetConfig

# Partial update - only update settings (if needed)
grpcurl -plaintext -d '{
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "config": {
    "settings": {}
  }
}' localhost:50051 coinbase_importer.ImporterService/SetConfig
```

#### **gRPC Service Endpoints**

The service `coinbase_importer.ImporterService` provides the following endpoints:

1. **StartImport** - Start an import for a specific source
   - Request: `{"source": "app" | "pro" | "all", "user_id": "uuid"}` (user_id is REQUIRED)
   - Response: `{"success": bool, "message": string}`
   - **Note**: 
     - The `user_id` field (UUID string) is **required** and associates imported data with a specific user.
     - Configuration must exist for the user_id in `exchanges.exchange_configs` table before starting imports.
     - If configuration doesn't exist, the import will fail with an error message.
     - The `user_id` will be automatically added to all imported records in the database tables for data isolation.

2. **StopImport** - Stop a running import for a specific source
   - Request: `{"source": "app" | "pro" | "all"}`
   - Response: `{"success": bool, "message": string}`

3. **GetStatus** - Get current importer status for a user
   - Request: `{"user_id": "uuid"}` (user_id is required)
   - Response: `{"status": ImporterStatus, "success": bool, "message": string}`
   - Status includes per-source information (app, pro) for the specified user with:
     - `is_running`: Whether import is currently running
     - `last_run_time`: ISO timestamp of last run
     - `last_error`: Last error message (if any)
     - `total_runs`: Total number of runs
     - `successful_runs`: Number of successful runs
     - `failed_runs`: Number of failed runs
   - **Note**: Status is tracked per user_id. Each user has their own import history and statistics.

4. **GetConfig** - Get current configuration for a user
   - Request: `{"user_id": "uuid"}` (user_id is required)
   - Response: `{"config": ImporterConfig, "success": bool, "message": string}`
   - Config includes:
     - `coinbase_api_key`: Coinbase API key
     - `coinbase_api_secret`: Coinbase API secret (masked as `********` for security)
     - `coinbase_pro_accounts_folder_path`: Path to Coinbase Pro accounts CSV folder
     - `coinbase_pro_fills_folder_path`: Path to Coinbase Pro fills CSV folder
     - `settings`: Map of additional settings (currently unused, reserved for future use)
   - **Note**: The API secret is automatically masked as `********` in the response for security reasons.
   - **Storage**: Configuration is loaded from `exchanges.exchange_configs` PostgreSQL table.

5. **SetConfig** - Save/update configuration for a user (supports partial updates)
   - Request: `{"user_id": "uuid", "config": ImporterConfig}` (user_id is required, only include config fields you want to update)
   - Response: `{"success": bool, "message": string}`
   - **Storage**: Configuration is saved to `exchanges.exchange_configs` PostgreSQL table.
   - **Partial Updates**: Only non-empty fields in the request are updated. Empty fields or fields set to `""` are ignored, preserving existing values.
   - **Security**: If `coinbase_api_secret` is set to `"********"` (the masked value), it will be ignored and the existing secret will be preserved.
   - **Scope**: Only exchange-related configuration can be updated (Coinbase API credentials, file paths, and settings). PostgreSQL database configuration must be set via environment variables (`.env` file).
   - **Examples**:
     - Set full config: `{"user_id": "uuid", "config": {"coinbase_api_key": "key", "coinbase_api_secret": "secret", ...}}`
     - Update only API key: `{"user_id": "uuid", "config": {"coinbase_api_key": "new_key"}}`
     - Update only API secret: `{"user_id": "uuid", "config": {"coinbase_api_secret": "new_secret"}}`
     - Update multiple fields: `{"user_id": "uuid", "config": {"coinbase_api_key": "new_key", "coinbase_pro_accounts_folder_path": "/new/path"}}`
     - Update settings: `{"user_id": "uuid", "config": {"settings": {}}}`

#### **gRPC Service Features**
- **Configuration Management**: Get and set Coinbase API credentials, file paths, and settings
  - **Storage**: Configuration is stored in PostgreSQL `exchanges.exchange_configs` table (not `.env` files)
  - **Per-User**: Each user has their own configuration identified by `user_id`
  - **Security**: API secrets are automatically masked (`********`) in `GetConfig` responses
  - **Partial Updates**: `SetConfig` supports partial updates - only include fields you want to change
  - **Scope**: Only exchange-related configuration can be updated via gRPC. PostgreSQL database connection settings must be configured via environment variables (`.env` file)
  - **Required**: Configuration must be set via `SetConfig` before imports can start
- **Status Monitoring**: Real-time status per source (app, pro) with statistics and error tracking
  - **Per-User**: Status is tracked separately for each user_id
  - Each user has their own import history, statistics, and running state
  - Use `GetStatus` with `user_id` to retrieve status for a specific user
- **Remote Control**: Start/stop imports for individual sources or all sources (requires `user_id`)
- **Dynamic Updates**: Change configuration without restart
- **Validation**: Imports validate that configuration exists before starting, returning clear error messages if missing

#### **Source Types**
- **"app"**: Coinbase App (Coinbase Advanced Trade)
- **"pro"**: Coinbase Pro (CSV file imports)
- **"all"**: Both sources

#### **Status Monitoring**
Get real-time status information per source:
- Current running state (`is_running`)
- Last run time (`last_run_time`)
- Last error message (`last_error`)
- Statistics:
  - Total runs (`total_runs`)
  - Successful runs (`successful_runs`)
  - Failed runs (`failed_runs`)

#### **Configuration Schema**
The protobuf schema defines these configuration options:
```protobuf
message StartImportRequest {
    string source = 1;                                 // "app", "pro", or "all"
    string user_id = 2;                                // UUID of the user for data isolation (optional)
}

message ImporterConfig {
    string coinbase_api_key = 1;                      // Coinbase API key
    string coinbase_api_secret = 2;                    // Coinbase API secret
    string coinbase_pro_accounts_folder_path = 3;      // Path to accounts CSV folder
    string coinbase_pro_fills_folder_path = 4;         // Path to fills CSV folder
    map<string, string> settings = 5;                 // Additional settings (reserved for future use)
}

message SourceStatus {
    bool is_running = 1;                               // Whether import is running
    string last_run_time = 2;                          // ISO timestamp of last run
    string last_error = 3;                             // Last error message
    int32 total_runs = 4;                              // Total number of runs
    int32 successful_runs = 5;                        // Number of successful runs
    int32 failed_runs = 6;                             // Number of failed runs
}

message ImporterStatus {
    map<string, SourceStatus> sources = 1;            // Status per source (app, pro)
    bool is_running = 2;                               // Overall running state
    string last_updated = 3;                           // ISO timestamp
}
```

#### **User Data Isolation**
All imported data is associated with a `user_id` (UUID) for multi-user support:
- **Required**: `user_id` is **required** in `StartImport` requests - imports will fail without it
- When `user_id` is provided, it is automatically added to all imported records
- Database tables include a `user_id` column that references `users.users(id)`
- This enables proper data isolation and multi-tenant support
- The `user_id` must be a valid UUID that exists in the `users.users` table
- **Configuration**: Each user must have their own Coinbase configuration set via `SetConfig` before imports can run

#### **Backend Integration**
The backend can communicate with importers to:
1. **Monitor Health**: Check if importers are running and healthy via `GetStatus` (with required `user_id`)
2. **Control Operations**: Start/stop imports via `StartImport`/`StopImport` (with required `user_id` for data isolation)
3. **Manage Configuration**: Get and update configuration via `GetConfig`/`SetConfig` (with required `user_id`)
4. **Collect Statistics**: Gather performance metrics from status information per user
5. **User-Specific Imports**: Trigger imports for specific users by including `user_id` in `StartImport` requests
6. **Configuration Management**: Store and retrieve user-specific Coinbase configurations from PostgreSQL database
7. **User Status Tracking**: Monitor import status and history separately for each user

#### **Security Considerations**
- The gRPC server runs on an insecure channel by default (port 50051)
- For production, implement TLS/SSL encryption
- Consider authentication and authorization
- Use proper network security (firewalls, VPNs)
- API keys and secrets are transmitted in configuration - ensure secure channels

#### **Troubleshooting gRPC**
Common issues:
1. **gRPC code not found**: Run `python generate_grpc.py` to generate gRPC code
2. **Port already in use**: Ensure port 50051 is available or change the port in the code
3. **Connection refused**: Ensure the importer is running with gRPC enabled
4. **Import errors**: Check that all dependencies are installed and configuration is correct
5. **Service not found**: Verify the service name is `coinbase_importer.ImporterService`
6. **Configuration not found**: If imports fail with "No Coinbase configuration found", use `SetConfig` to configure settings for the user_id before starting imports
7. **Missing user_id**: All `StartImport`, `GetConfig`, `SetConfig`, and `GetStatus` requests require `user_id` - ensure it's included in requests
8. **Database connection errors**: Verify PostgreSQL connection settings in `.env` file (POSTGRES_* variables)

Check gRPC logs:
```bash
# View logs from Docker
./scripts/docker-compose-run.sh coinbase logs -f | grep -i grpc

# Or check application logs
tail -f app.log | grep -i grpc
```

### **8. Development Workflow**

```bash
# Start shared infrastructure
./scripts/docker-compose-run.sh infrastructure up -d

# Start coinbase importer with shared infrastructure
./scripts/docker-compose-run.sh coinbase up -d --build

# Start gRPC service for remote control (local)
cd apps/importers/coinbase
poetry shell
python main.py

# Test gRPC service
grpcurl -plaintext localhost:50051 coinbase_importer.ImporterService/GetStatus

# Connect to database
docker exec -it arqos-postgres psql -U arqos_user -d arqos

# View logs
./scripts/docker-compose-run.sh coinbase logs -f
```