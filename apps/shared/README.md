# Shared Configuration and Database

This directory contains shared configuration and database migrations for the Arqos project.

## Structure

```
arqos/
└── apps/
    ├── shared/
    │   ├── .env                    # Shared configuration (database, Redis, API, etc.)
    │   ├── database/
    │   │   └── migrations/         # Database migration files
    │   └── utils/
    │       └── env_loader.py       # Environment loading utilities
    ├── importers/
    │   └── coinbase/
    │       ├── .env                # Coinbase-specific configuration
    │       └── env_example.py      # Usage example
    ├── frontend/
    └── backend/
```

## Database Migrations

Database migrations are managed using [dbmate](https://github.com/amacneil/dbmate). Migration files are located in `database/migrations/`.

### Quick Start

1. Install dbmate: `brew install dbmate` (or download from [releases](https://github.com/amacneil/dbmate/releases))
2. Ensure your `.env` file has the database variables set: `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DATABASE`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
3. Run migrations as shown below

### Running Migrations

Since the project uses individual PostgreSQL environment variables (`POSTGRES_HOST`, `POSTGRES_PORT`, etc.) instead of `DATABASE_URL`, you need to construct the connection string.

First, load the environment variables from `apps/shared/.env`:

```bash
# Load environment variables from .env file
export $(grep -v '^#' ./apps/shared/.env | xargs)

# Then run dbmate
dbmate \
  --migrations-dir apps/shared/database/migrations \
  --url "postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DATABASE}?sslmode=disable" \
  up
```

### Creating Migrations

```bash
# Load environment variables first
export $(grep -v '^#' ./apps/shared/.env | xargs)
# Create new migration
dbmate \
  --migrations-dir apps/shared/database/migrations \
  --url "postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DATABASE}?sslmode=disable" \
  new migration_name
```

This creates a file with `-- migrate:up` and `-- migrate:down` sections. Edit the file to add your SQL.

### Common Commands

```bash
# Load environment variables first
export $(grep -v '^#' ./apps/shared/.env | xargs)

# Apply pending migrations
dbmate --migrations-dir apps/shared/database/migrations --url "postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DATABASE}?sslmode=disable" up

# Rollback last migration
dbmate --migrations-dir apps/shared/database/migrations --url "postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DATABASE}?sslmode=disable" down

# Check migration status
dbmate --migrations-dir apps/shared/database/migrations --url "postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DATABASE}?sslmode=disable" status
```

**Tip:** Create a shell function to simplify usage:

```bash
dbmate-arqos() {
  export $(grep -v '^#' ./apps/shared/.env | xargs)
  dbmate \
    --migrations-dir apps/shared/database/migrations \
    --url "postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DATABASE}?sslmode=disable" \
    "$@"
}

# Then use it like:
dbmate-arqos up
dbmate-arqos down
dbmate-arqos status
dbmate-arqos new migration_name
```

## How it works

1. **Shared Configuration** (`shared/.env`): Contains common settings like database, Redis, API, cache, and logging configuration
2. **Project Configuration** (`coinbase/.env`): Contains project-specific settings and overrides shared configuration
3. **Loading Order**: Shared config loads first, then project config overrides it

## Usage

```python
import sys
from pathlib import Path

# Add shared directory to Python path
project_root = Path(__file__).parent
shared_root = project_root.parent.parent / "shared"
sys.path.insert(0, str(shared_root))

from shared.utils.env_loader import load_environment, get_database_config

# Load environment variables
load_environment(project_root)

# Get specific configurations
db_config = get_database_config()
```

## Available Functions

- `load_environment(project_root)`: Load both shared and project environment variables
- `get_database_config()`: Get database configuration
- `get_redis_config()`: Get Redis configuration  
- `get_api_config()`: Get API configuration
- `get_cache_config()`: Get cache configuration
- `get_logging_config()`: Get logging configuration
- `get_coinbase_config()`: Get Coinbase-specific configuration

## Environment Variables

### Shared Variables (shared/.env)
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DATABASE`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_SCHEMA`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`
- `API_PORT`, `API_HOST`, `JWT_SECRET`, `NODE_ENV`
- `USE_CACHE`, `CACHE_DIRECTORY`, `CACHE_TTL`
- `LOG_LEVEL`, `LOG_FORMAT`, `LOG_FILE`

### Coinbase Variables (coinbase/.env)
- `COINBASE_API_KEY`, `COINBASE_API_SECRET`
- `COINBASE_PRO_ACCOUNTS_FOLDER_PATH`, `COINBASE_PRO_FILLS_FOLDER_PATH`
- Project-specific overrides for database settings

## Example

Run the example to see the configuration in action:

```bash
cd apps/importers/coinbase
python env_example.py
```

This will show you all the loaded configuration values.

