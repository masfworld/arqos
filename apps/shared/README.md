# Simple Environment Configuration

This is a simplified environment configuration system using `python-dotenv` to load shared and project-specific environment variables.

## Structure

```
arqos/
└── apps/
    ├── shared/
    │   ├── .env                    # Shared configuration (database, Redis, API, etc.)
    │   └── utils/
    │       └── env_loader.py       # Environment loading utilities
    ├── importers/
    │   └── coinbase/
    │       ├── .env                # Coinbase-specific configuration
    │       └── env_example.py      # Usage example
    ├── frontend/
    └── backend/
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



# TODO: Next actions
- Check if loads are incremental
- In coinbase, parse coinbase_app_accounts and transactions from raw to processed,
- Try to build a view in public schema to load transactions
- Endpoint in background to call previous view