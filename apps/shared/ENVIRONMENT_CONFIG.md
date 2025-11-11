# Arqos Environment Configuration System

This document explains the centralized environment configuration system used across all Arqos projects.

## Overview

The environment configuration system provides a centralized way to manage environment variables across multiple projects while allowing project-specific overrides.

## Structure

```
arqos/
├── shared/
│   ├── .env.example          # Shared configuration template
│   ├── .env                  # Shared configuration (create from .env.example)
│   └── utils/
│       └── environment.py    # Environment loading utilities
├── apps/
│   ├── importers/
│   │   └── coinbase/
│   │       ├── .env.example  # Coinbase-specific configuration
│   │       └── .env          # Coinbase configuration (create from .env.example)
│   └── frontend/
│       ├── .env.example      # Frontend-specific configuration
│       └── .env              # Frontend configuration (create from .env.example)
└── .env.example              # Root project configuration
```

## Configuration Hierarchy

The system loads configuration in the following order (later values override earlier ones):

1. **Shared Configuration** (`shared/.env` or `shared/.env.example`)
2. **Project-Specific Configuration** (`project/.env` or `project/.env.example`)

## Shared Configuration

The shared configuration (`shared/.env.example`) contains:

- **Database Configuration**: PostgreSQL connection settings
- **Redis Configuration**: Cache and session store settings
- **API Configuration**: Main API settings
- **Cache Configuration**: Shared cache settings
- **Logging Configuration**: Logging levels and formats
- **Security Configuration**: Encryption keys and secrets

## Project-Specific Configuration

Each project can override shared configuration and add project-specific settings:

- **Coinbase Importer**: Coinbase API keys, CSV paths, database schema overrides
- **Frontend**: Frontend-specific API endpoints, build settings
- **Backend**: Backend-specific database settings, service configurations

## Usage

### Python Projects

```python
from pathlib import Path
import sys

# Add shared directory to Python path
project_root = Path(__file__).parent
shared_root = project_root.parent.parent / "shared"
sys.path.insert(0, str(shared_root))

from shared.utils.environment import load_environment

# Load environment configuration
env_config = load_environment(project_root)

# Get specific configurations
db_config = env_config.get_database_config()
redis_config = env_config.get_redis_config()
api_config = env_config.get_api_config()
```

### Node.js Projects

For Node.js projects, you can use the `dotenv` package with multiple files:

```javascript
require('dotenv').config({ path: '../../shared/.env' });
require('dotenv').config({ path: '.env', override: true });
```

## Configuration Methods

The `EnvironmentConfig` class provides several methods:

- `load_shared_config()`: Load only shared configuration
- `load_project_config()`: Load only project-specific configuration
- `load_all_config()`: Load both (recommended)
- `get_database_config()`: Get database configuration
- `get_redis_config()`: Get Redis configuration
- `get_api_config()`: Get API configuration
- `get_cache_config()`: Get cache configuration
- `get_logging_config()`: Get logging configuration

## Setup Instructions

### 1. Create Shared Configuration

```bash
cd shared
cp .env.example .env
# Edit .env with your actual values
```

### 2. Create Project-Specific Configuration

```bash
cd apps/importers/coinbase
cp .env.example .env
# Edit .env with your project-specific values
```

### 3. Use in Your Code

```python
# In your Python project
from shared.utils.environment import load_environment

env_config = load_environment()
db_config = env_config.get_database_config()
```

## Environment Variables

### Shared Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_HOST` | PostgreSQL host | `localhost` |
| `POSTGRES_PORT` | PostgreSQL port | `5432` |
| `POSTGRES_DATABASE` | Database name | `arqos` |
| `POSTGRES_USER` | Database user | `arqos_user` |
| `POSTGRES_PASSWORD` | Database password | (required) |
| `POSTGRES_SCHEMA` | Database schema | `public` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password | (empty) |
| `API_PORT` | API port | `3000` |
| `API_HOST` | API host | `localhost` |
| `JWT_SECRET` | JWT secret key | (required) |
| `USE_CACHE` | Enable caching | `true` |
| `CACHE_DIRECTORY` | Cache directory | `.cache` |
| `LOG_LEVEL` | Logging level | `info` |

### Project-Specific Variables

#### Coinbase Importer

| Variable | Description |
|----------|-------------|
| `COINBASE_API_KEY` | Coinbase API key |
| `COINBASE_API_SECRET` | Coinbase API secret |
| `COINBASE_PRO_ACCOUNTS_FOLDER_PATH` | Path to accounts CSV files |
| `COINBASE_PRO_FILLS_FOLDER_PATH` | Path to fills CSV files |

## Best Practices

1. **Never commit `.env` files** - Only commit `.env.example` files
2. **Use descriptive variable names** - Make it clear what each variable controls
3. **Group related variables** - Use comments to organize configuration sections
4. **Provide defaults** - Always provide sensible defaults in `.env.example`
5. **Document required variables** - Mark required variables clearly
6. **Use environment-specific overrides** - Override shared config only when necessary

## Troubleshooting

### Configuration Not Loading

1. Check that the shared directory path is correct
2. Verify that `.env` or `.env.example` files exist
3. Ensure the Python path includes the shared directory

### Variables Not Overriding

1. Make sure project-specific `.env` files are loaded after shared config
2. Check that variable names match exactly
3. Verify that the `override=True` parameter is used

### Missing Variables

1. Check that all required variables are defined
2. Verify that `.env` files are properly formatted
3. Ensure no trailing spaces or special characters in variable names
