"""
Database service for Coinbase configuration management.
Handles loading and saving Coinbase configuration from PostgreSQL database.
"""

import psycopg2
import json
import logging
from typing import Optional
from shared.utils.env_loader import get_database_config
from grpc_service.coinbase_importer_config import CoinbaseImporterConfig

logger = logging.getLogger(__name__)


class ConfigDBService:
    """Service for managing Coinbase configuration in PostgreSQL database."""
    
    def __init__(self):
        """Initialize ConfigDBService with database configuration."""
        self.db_config = get_database_config()
        self.connection = None
    
    def _get_connection(self):
        """Get or create database connection."""
        if self.connection is None or self.connection.closed:
            try:
                self.connection = psycopg2.connect(
                    host=self.db_config['host'],
                    port=self.db_config['port'],
                    database=self.db_config['database'],
                    user=self.db_config['user'],
                    password=self.db_config['password']
                )
                logger.info("Connected to PostgreSQL database for config management")
            except Exception as e:
                logger.error(f"Error connecting to PostgreSQL: {e}")
                raise
        return self.connection
    
    def get_config(self, user_id: str) -> Optional[CoinbaseImporterConfig]:
        """
        Load Coinbase configuration from database for a specific user.
        
        Args:
            user_id: UUID of the user
            
        Returns:
            CoinbaseImporterConfig if found, None otherwise
            
        Raises:
            Exception: If database query fails
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            query = """
                SELECT api_key, api_secret, config_data
                FROM exchanges.exchange_configs
                WHERE user_id = %s AND exchange_name = 'coinbase' AND is_active = true
                LIMIT 1
            """
            cursor.execute(query, (user_id,))
            row = cursor.fetchone()
            
            if not row:
                logger.warning(f"No Coinbase configuration found for user_id: {user_id}")
                return None
            
            api_key, api_secret, config_data_json = row
            
            # Parse additional config from JSONB field
            additional_config = {}
            if config_data_json:
                try:
                    additional_config = json.loads(config_data_json) if isinstance(config_data_json, str) else config_data_json
                except (json.JSONDecodeError, TypeError):
                    logger.warning(f"Failed to parse config_data JSON for user_id: {user_id}")
                    additional_config = {}
            
            # Extract Coinbase Pro paths and settings from additional_config
            coinbase_pro_accounts_path = additional_config.get('coinbase_pro_accounts_folder_path', '')
            coinbase_pro_fills_path = additional_config.get('coinbase_pro_fills_folder_path', '')
            settings = additional_config.get('settings', {})
            
            config = CoinbaseImporterConfig(
                coinbase_api_key=api_key or '',
                coinbase_api_secret=api_secret or '',
                coinbase_pro_accounts_folder_path=coinbase_pro_accounts_path,
                coinbase_pro_fills_folder_path=coinbase_pro_fills_path,
                settings=settings if isinstance(settings, dict) else {}
            )
            
            logger.info(f"Loaded Coinbase configuration for user_id: {user_id}")
            return config
            
        except Exception as e:
            logger.error(f"Error loading Coinbase configuration: {e}")
            raise
        finally:
            cursor.close()
    
    def save_config(self, user_id: str, config: CoinbaseImporterConfig) -> bool:
        """
        Save Coinbase configuration to database for a specific user.
        
        Args:
            user_id: UUID of the user
            config: CoinbaseImporterConfig to save
            
        Returns:
            True if successful
            
        Raises:
            Exception: If database operation fails
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            # Prepare additional config data as JSON
            additional_config = {
                'coinbase_pro_accounts_folder_path': config.coinbase_pro_accounts_folder_path,
                'coinbase_pro_fills_folder_path': config.coinbase_pro_fills_folder_path,
                'settings': config.settings
            }
            config_data_json = json.dumps(additional_config)
            
            # Use UPSERT (INSERT ... ON CONFLICT UPDATE)
            query = """
                INSERT INTO exchanges.exchange_configs 
                    (user_id, exchange_name, api_key, api_secret, config_data, is_active)
                VALUES (%s, 'coinbase', %s, %s, %s::jsonb, true)
                ON CONFLICT (user_id, exchange_name)
                DO UPDATE SET
                    api_key = EXCLUDED.api_key,
                    api_secret = EXCLUDED.api_secret,
                    config_data = EXCLUDED.config_data,
                    is_active = EXCLUDED.is_active,
                    updated_at = CURRENT_TIMESTAMP
            """
            
            cursor.execute(query, (
                user_id,
                config.coinbase_api_key,
                config.coinbase_api_secret,
                config_data_json
            ))
            conn.commit()
            
            logger.info(f"Saved Coinbase configuration for user_id: {user_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error saving Coinbase configuration: {e}")
            conn.rollback()
            raise
        finally:
            cursor.close()
    
    def close_connection(self):
        """Close database connection."""
        if self.connection and not self.connection.closed:
            self.connection.close()
            logger.info("PostgreSQL config connection closed")

