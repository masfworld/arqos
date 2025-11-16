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
            # Query for all Coinbase configs (coinbase, coinbase_app, coinbase_pro)
            # Order by priority: coinbase first, then coinbase_app, then coinbase_pro
            query = """
                SELECT exchange_name, api_key, api_secret, config_data
                FROM exchanges.exchange_configs
                WHERE user_id = %s 
                  AND exchange_name IN ('coinbase', 'coinbase_app', 'coinbase_pro')
                  AND is_active = true
                ORDER BY 
                  CASE exchange_name
                    WHEN 'coinbase' THEN 1
                    WHEN 'coinbase_app' THEN 2
                    WHEN 'coinbase_pro' THEN 3
                  END
            """
            cursor.execute(query, (user_id,))
            rows = cursor.fetchall()
            
            if not rows:
                logger.warning(f"No Coinbase configuration found for user_id: {user_id}")
                return None
            
            # Merge configs from all sources
            merged_api_key = None
            merged_api_secret = None
            merged_config_data = {}
            
            for row in rows:
                exchange_name, api_key, api_secret, config_data_json = row
                
                # Use first non-null API key/secret found
                if not merged_api_key and api_key:
                    merged_api_key = api_key
                if not merged_api_secret and api_secret:
                    merged_api_secret = api_secret
                
                # Merge config_data from all sources
                if config_data_json:
                    try:
                        config_data = json.loads(config_data_json) if isinstance(config_data_json, str) else config_data_json
                        if isinstance(config_data, dict):
                            merged_config_data.update(config_data)
                    except (json.JSONDecodeError, TypeError):
                        logger.warning(f"Failed to parse config_data JSON for exchange_name={exchange_name}, user_id={user_id}")
            
            # Extract Coinbase Pro paths and settings from merged config
            coinbase_pro_accounts_path = merged_config_data.get('coinbase_pro_accounts_folder_path', '')
            coinbase_pro_fills_path = merged_config_data.get('coinbase_pro_fills_folder_path', '')
            settings = merged_config_data.get('settings', {})
            
            config = CoinbaseImporterConfig(
                coinbase_api_key=merged_api_key or '',
                coinbase_api_secret=merged_api_secret or '',
                coinbase_pro_accounts_folder_path=coinbase_pro_accounts_path,
                coinbase_pro_fills_folder_path=coinbase_pro_fills_path,
                settings=settings if isinstance(settings, dict) else {}
            )
            
            logger.info(f"Loaded Coinbase configuration for user_id: {user_id} (from {len(rows)} config(s))")
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

