"""
Simple Environment Configuration Loader
Uses python-dotenv to load shared and project-specific environment variables.

This module provides centralized configuration management for all Arqos components.
Configuration is organized by component for clarity.

Components:
- Core: Environment loading
- Database: PostgreSQL configuration
- Cache: Redis and file cache configuration
- API: Backend API configuration
- Logging: Logging configuration
- Coinbase: Coinbase importer specific configuration
"""

import os
from pathlib import Path
from dotenv import load_dotenv


# ============================================================================
# CORE: Environment Loading
# ============================================================================

def load_environment(project_root: Path = None):
    """
    Load environment variables from shared and project .env files.
    
    Loads configuration in the following order:
    1. Shared configuration from apps/shared/.env
    2. Project-specific configuration from project/.env (overrides shared)
    
    Args:
        project_root: Root directory of the project. If None, uses current working directory.
    
    Returns:
        Dictionary of loaded environment variables.
    
    Example:
        >>> load_environment(Path(__file__).parent)
        >>> db_config = get_database_config()
    """
    if project_root is None:
        project_root = Path.cwd()
    
    # Find shared directory
    # project_root is at apps/importers/coinbase
    # shared is at apps/shared
    shared_root = project_root.parent.parent / "shared"
    
    # Load shared environment first
    shared_env_file = shared_root / ".env"
    if shared_env_file.exists():
        load_dotenv(shared_env_file)
        print(f"Loaded shared environment from: {shared_env_file}")
    else:
        print(f"Warning: Shared environment file not found at {shared_env_file}")
    
    # Load project-specific environment (overrides shared)
    project_env_file = project_root / ".env"
    if project_env_file.exists():
        load_dotenv(project_env_file, override=True)
        print(f"Loaded project environment from: {project_env_file}")
    else:
        print(f"Warning: Project environment file not found at {project_env_file}")
    
    return dict(os.environ)


# ============================================================================
# DATABASE: PostgreSQL Configuration
# ============================================================================

def get_database_config():
    """
    Get PostgreSQL database configuration from environment variables.
    
    Returns:
        Dictionary with database configuration:
        - host: Database host (default: 'localhost')
        - port: Database port (default: 5432)
        - database: Database name (default: 'arqos')
        - user: Database user (default: 'arqos_user')
        - password: Database password (default: '')
        - schema: Database schema (default: 'public')
    
    Environment Variables:
        POSTGRES_HOST: Database host
        POSTGRES_PORT: Database port
        POSTGRES_DATABASE: Database name
        POSTGRES_USER: Database user
        POSTGRES_PASSWORD: Database password
        POSTGRES_SCHEMA: Database schema
    
    Used by:
        - PostgresWriter (importers)
        - Backend API services
    """
    return {
        'host': os.getenv('POSTGRES_HOST', 'localhost'),
        'port': int(os.getenv('POSTGRES_PORT', '5432')),
        'database': os.getenv('POSTGRES_DATABASE', 'arqos'),
        'user': os.getenv('POSTGRES_USER', 'arqos_user'),
        'password': os.getenv('POSTGRES_PASSWORD', ''),
        'schema': os.getenv('POSTGRES_SCHEMA', 'public'),
    }


# ============================================================================
# CACHE: Redis and File Cache Configuration
# ============================================================================

def get_redis_config():
    """
    Get Redis configuration from environment variables.
    
    Returns:
        Dictionary with Redis configuration:
        - host: Redis host (default: 'localhost')
        - port: Redis port (default: 6379)
        - password: Redis password (default: '')
        - db: Redis database number (default: 0)
    
    Environment Variables:
        REDIS_HOST: Redis host
        REDIS_PORT: Redis port
        REDIS_PASSWORD: Redis password
        REDIS_DB: Redis database number
    
    Used by:
        - Backend API (caching, sessions)
    """
    return {
        'host': os.getenv('REDIS_HOST', 'localhost'),
        'port': int(os.getenv('REDIS_PORT', '6379')),
        'password': os.getenv('REDIS_PASSWORD', ''),
        'db': int(os.getenv('REDIS_DB', '0')),
    }


def get_cache_config():
    """
    Get file cache configuration from environment variables.
    
    Returns:
        Dictionary with cache configuration:
        - use_cache: Whether to use caching (default: True)
        - cache_directory: Cache directory path (default: '.cache')
        - cache_ttl: Cache TTL in seconds (default: 3600)
    
    Environment Variables:
        USE_CACHE: Enable/disable caching ('true'/'false')
        CACHE_DIRECTORY: Cache directory path
        CACHE_TTL: Cache TTL in seconds
    
    Used by:
        - Importers (file-based caching)
    """
    return {
        'use_cache': os.getenv('USE_CACHE', 'true').lower() == 'true',
        'cache_directory': os.getenv('CACHE_DIRECTORY', '.cache'),
        'cache_ttl': int(os.getenv('CACHE_TTL', '3600')),
    }


def get_use_cache():
    """
    Get USE_CACHE boolean value from environment variables.
    
    Returns:
        bool: True if caching is enabled, False otherwise (default: False)
    
    Environment Variables:
        USE_CACHE: Enable/disable caching ('true'/'false'/'1'/'0'/'yes'/'no'/'on'/'off')
    
    Used by:
        - Importers (CacheManager)
    """
    value = os.getenv('USE_CACHE', 'false')
    return value.lower() in ('true', '1', 'yes', 'on')


def get_cache_directory():
    """
    Get cache directory path from environment variables.
    
    Returns:
        str: Cache directory path (default: '.cache')
    
    Environment Variables:
        CACHE_DIRECTORY: Cache directory path
    
    Used by:
        - Importers (CacheManager)
    """
    return os.getenv('CACHE_DIRECTORY', '.cache')


# ============================================================================
# API: Backend API Configuration
# ============================================================================

def get_api_config():
    """
    Get backend API configuration from environment variables.
    
    Returns:
        Dictionary with API configuration:
        - host: API host (default: 'localhost')
        - port: API port (default: '3000')
        - jwt_secret: JWT secret key (default: '')
        - node_env: Node environment (default: 'development')
    
    Environment Variables:
        API_HOST: API host
        API_PORT: API port
        JWT_SECRET: JWT secret key
        NODE_ENV: Node environment ('development'/'production')
    
    Used by:
        - Backend API server
    """
    return {
        'host': os.getenv('API_HOST', 'localhost'),
        'port': int(os.getenv('API_PORT', '3000')),
        'jwt_secret': os.getenv('JWT_SECRET', ''),
        'node_env': os.getenv('NODE_ENV', 'development'),
    }


# ============================================================================
# LOGGING: Logging Configuration
# ============================================================================

def get_logging_config():
    """
    Get logging configuration from environment variables.
    
    Returns:
        Dictionary with logging configuration:
        - level: Log level (default: 'info')
        - format: Log format (default: 'json')
        - file: Log file path (default: 'app.log')
    
    Environment Variables:
        LOG_LEVEL: Log level ('debug'/'info'/'warning'/'error'/'critical')
        LOG_FORMAT: Log format ('json'/'text')
        LOG_FILE: Log file path
    
    Used by:
        - All components (logging setup)
    """
    return {
        'level': os.getenv('LOG_LEVEL', 'info'),
        'format': os.getenv('LOG_FORMAT', 'json'),
        'file': os.getenv('LOG_FILE', 'app.log'),
    }


# ============================================================================
# COINBASE: Coinbase Importer Configuration
# ============================================================================

def get_coinbase_config():
    """
    Get Coinbase-specific configuration from environment variables.
    
    Returns:
        Dictionary with Coinbase configuration:
        - api_key: Coinbase API key
        - api_secret: Coinbase API secret
        - pro_accounts_path: Coinbase Pro accounts folder path
        - pro_fills_path: Coinbase Pro fills folder path
    
    Environment Variables:
        COINBASE_API_KEY: Coinbase API key
        COINBASE_API_SECRET: Coinbase API secret
        COINBASE_PRO_ACCOUNTS_FOLDER_PATH: Coinbase Pro accounts CSV folder path
        COINBASE_PRO_FILLS_FOLDER_PATH: Coinbase Pro fills CSV folder path
    
    Used by:
        - Coinbase importer
    """
    return {
        'api_key': os.getenv('COINBASE_API_KEY', ''),
        'api_secret': os.getenv('COINBASE_API_SECRET', ''),
        'pro_accounts_path': os.getenv('COINBASE_PRO_ACCOUNTS_FOLDER_PATH', ''),
        'pro_fills_path': os.getenv('COINBASE_PRO_FILLS_FOLDER_PATH', ''),
    }


def get_coinbase_api_key():
    """
    Get Coinbase API key from environment variables.
    
    Returns:
        str: Coinbase API key or None if not set
    
    Environment Variables:
        COINBASE_API_KEY: Coinbase API key
    
    Used by:
        - CoinbaseSecrets (Coinbase App importer)
    """
    return os.getenv('COINBASE_API_KEY')


def get_coinbase_api_secret():
    """
    Get Coinbase API secret from environment variables.
    
    Returns:
        str: Coinbase API secret or None if not set
    
    Environment Variables:
        COINBASE_API_SECRET: Coinbase API secret
    
    Used by:
        - CoinbaseSecrets (Coinbase App importer)
    """
    return os.getenv('COINBASE_API_SECRET')


def get_coinbase_pro_accounts_path():
    """
    Get Coinbase Pro accounts folder path from environment variables.
    
    Returns:
        str: Path to Coinbase Pro accounts CSV folder or None if not set
    
    Environment Variables:
        COINBASE_PRO_ACCOUNTS_FOLDER_PATH: Coinbase Pro accounts CSV folder path
    
    Used by:
        - CoinbaseProExtractor (accounts extraction)
    """
    return os.getenv('COINBASE_PRO_ACCOUNTS_FOLDER_PATH')


def get_coinbase_pro_fills_path():
    """
    Get Coinbase Pro fills folder path from environment variables.
    
    Returns:
        str: Path to Coinbase Pro fills CSV folder or None if not set
    
    Environment Variables:
        COINBASE_PRO_FILLS_FOLDER_PATH: Coinbase Pro fills CSV folder path
    
    Used by:
        - CoinbaseProExtractor (fills extraction)
    """
    return os.getenv('COINBASE_PRO_FILLS_FOLDER_PATH')
