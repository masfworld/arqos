"""
Transformation module for Coinbase App data.
Transforms raw JSON data from raw tables into structured refined tables.
"""
import json
import logging
import pandas as pd
from decimal import Decimal
from datetime import datetime
from typing import List, Dict, Any, Optional
import psycopg2
from psycopg2.extras import execute_values

from shared.utils.env_loader import get_database_config

logger = logging.getLogger(__name__)


class CoinbaseTransformer:
    """Transforms raw Coinbase App data from JSON to structured tables."""
    
    def __init__(self):
        """Initialize transformer with database configuration."""
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
                logger.info("Connected to PostgreSQL database for transformation")
            except Exception as e:
                logger.error(f"Error connecting to PostgreSQL: {e}")
                raise
        return self.connection
    
    def transform_accounts(self, import_id: str, user_id: str) -> int:
        """
        Transform accounts from raw table to refined table.
        
        Args:
            import_id: UUID of the import_history record
            user_id: UUID of the user
            
        Returns:
            int: Number of records transformed
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            # Fetch raw account data
            query = """
                SELECT id, data, ingestion_time
                FROM coinbase.coinbase_app_accounts_raw
                WHERE import_id = %s AND user_id = %s
            """
            cursor.execute(query, (import_id, user_id))
            raw_records = cursor.fetchall()
            
            if not raw_records:
                logger.info(f"No raw account records found for import_id: {import_id}")
                return 0
            
            # Transform records
            transformed_records = []
            for raw_id, data_json, ingestion_time in raw_records:
                try:
                    account_data = json.loads(data_json)
                    transformed = self._transform_account_record(
                        account_data, import_id, user_id, ingestion_time
                    )
                    if transformed:
                        transformed_records.append(transformed)
                except (json.JSONDecodeError, KeyError, ValueError) as e:
                    logger.warning(f"Error transforming account record {raw_id}: {e}")
                    continue
            
            if not transformed_records:
                logger.warning("No valid account records to insert")
                return 0
            
            # Insert transformed records
            insert_query = """
                INSERT INTO coinbase.coinbase_app_accounts (
                    import_id, user_id, uuid, name, currency,
                    available_balance_value, available_balance_currency,
                    is_default, is_active, created_at, updated_at, deleted_at,
                    account_type, is_ready, hold_value, hold_currency,
                    retail_portfolio_id, platform, ingestion_time
                ) VALUES %s
            """
            
            execute_values(
                cursor,
                insert_query,
                transformed_records,
                template=None,
                page_size=100
            )
            
            conn.commit()
            rows_inserted = len(transformed_records)
            logger.info(f"Successfully transformed {rows_inserted} account records")
            return rows_inserted
            
        except Exception as e:
            logger.error(f"Error transforming accounts: {e}")
            conn.rollback()
            raise
        finally:
            cursor.close()
    
    def transform_transactions(self, import_id: str, user_id: str) -> int:
        """
        Transform transactions from raw table to refined table.
        
        Args:
            import_id: UUID of the import_history record
            user_id: UUID of the user
            
        Returns:
            int: Number of records transformed
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            # Fetch raw transaction data
            query = """
                SELECT id, data, ingestion_time
                FROM coinbase.coinbase_app_transactions_raw
                WHERE import_id = %s AND user_id = %s
            """
            cursor.execute(query, (import_id, user_id))
            raw_records = cursor.fetchall()
            
            if not raw_records:
                logger.info(f"No raw transaction records found for import_id: {import_id}")
                return 0
            
            # Transform records
            transformed_records = []
            for raw_id, data_json, ingestion_time in raw_records:
                try:
                    transaction_data = json.loads(data_json)
                    transformed = self._transform_transaction_record(
                        transaction_data, import_id, user_id, ingestion_time
                    )
                    if transformed:
                        transformed_records.append(transformed)
                except (json.JSONDecodeError, KeyError, ValueError) as e:
                    logger.warning(f"Error transforming transaction record {raw_id}: {e}")
                    continue
            
            if not transformed_records:
                logger.warning("No valid transaction records to insert")
                return 0
            
            # Insert transformed records
            insert_query = """
                INSERT INTO coinbase.coinbase_app_transactions (
                    import_id, user_id, transaction_id, transaction_type,
                    created_at, status, resource, resource_path,
                    amount_value, amount_currency, native_amount_value, native_amount_currency,
                    advanced_trade_fill_commission, advanced_trade_fill_price,
                    advanced_trade_fill_order_id, advanced_trade_fill_order_side,
                    advanced_trade_fill_product_id, ingestion_time
                ) VALUES %s
            """
            
            execute_values(
                cursor,
                insert_query,
                transformed_records,
                template=None,
                page_size=100
            )
            
            conn.commit()
            rows_inserted = len(transformed_records)
            logger.info(f"Successfully transformed {rows_inserted} transaction records")
            return rows_inserted
            
        except Exception as e:
            logger.error(f"Error transforming transactions: {e}")
            conn.rollback()
            raise
        finally:
            cursor.close()
    
    def _transform_account_record(
        self, account_data: Dict[str, Any], import_id: str, user_id: str, ingestion_time: datetime
    ) -> Optional[tuple]:
        """
        Transform a single account record from JSON to database tuple.
        
        Args:
            account_data: Dictionary containing account data from JSON
            import_id: UUID of the import_history record
            user_id: UUID of the user
            ingestion_time: Timestamp from raw record
            
        Returns:
            tuple: Transformed record ready for insertion, or None if invalid
        """
        try:
            # Extract nested fields - handle both direct fields and nested structures
            uuid = account_data.get('uuid')
            if not uuid:
                logger.warning("Account record missing uuid, skipping")
                return None
            
            # Extract balance information - handle different possible structures
            available_balance = account_data.get('available_balance', {})
            if isinstance(available_balance, dict):
                available_balance_value = self._safe_decimal(available_balance.get('value') or available_balance.get('amount'))
                available_balance_currency = available_balance.get('currency')
            else:
                available_balance_value = None
                available_balance_currency = None
            
            # Extract hold information
            hold = account_data.get('hold', {})
            if isinstance(hold, dict):
                hold_value = self._safe_decimal(hold.get('value') or hold.get('amount'))
                hold_currency = hold.get('currency')
            else:
                hold_value = None
                hold_currency = None
            
            # Parse timestamps
            created_at = self._parse_timestamp(account_data.get('created_at'))
            updated_at = self._parse_timestamp(account_data.get('updated_at'))
            deleted_at = self._parse_timestamp(account_data.get('deleted_at'))
            
            return (
                import_id,
                user_id,
                uuid,
                account_data.get('name'),
                account_data.get('currency'),
                available_balance_value,
                available_balance_currency,
                account_data.get('is_default'),
                account_data.get('is_active'),
                created_at,
                updated_at,
                deleted_at,
                account_data.get('type') or account_data.get('account_type'),
                account_data.get('is_ready'),
                hold_value,
                hold_currency,
                account_data.get('retail_portfolio_id'),
                account_data.get('platform'),
                ingestion_time
            )
        except Exception as e:
            logger.error(f"Error transforming account record: {e}")
            return None
    
    def _transform_transaction_record(
        self, transaction_data: Dict[str, Any], import_id: str, user_id: str, ingestion_time: datetime
    ) -> Optional[tuple]:
        """
        Transform a single transaction record from JSON to database tuple.
        
        Args:
            transaction_data: Dictionary containing transaction data from JSON
            import_id: UUID of the import_history record
            user_id: UUID of the user
            ingestion_time: Timestamp from raw record
            
        Returns:
            tuple: Transformed record ready for insertion, or None if invalid
        """
        try:
            # Extract transaction ID
            transaction_id = transaction_data.get('id')
            if not transaction_id:
                logger.warning("Transaction record missing id, skipping")
                return None
            
            # Extract amount information - handle nested structure
            amount = transaction_data.get('amount', {})
            if isinstance(amount, dict):
                amount_value = self._safe_decimal(amount.get('amount'))
                amount_currency = amount.get('currency')
            else:
                amount_value = None
                amount_currency = None
            
            # Extract native amount information
            native_amount = transaction_data.get('native_amount', {})
            if isinstance(native_amount, dict):
                native_amount_value = self._safe_decimal(native_amount.get('amount'))
                native_amount_currency = native_amount.get('currency')
            else:
                native_amount_value = None
                native_amount_currency = None
            
            # Extract advanced trade fill information (if present)
            advanced_trade_fill = transaction_data.get('advanced_trade_fill', {})
            advanced_trade_fill_commission = self._safe_decimal(advanced_trade_fill.get('commission'))
            advanced_trade_fill_price = self._safe_decimal(advanced_trade_fill.get('price'))
            advanced_trade_fill_order_id = advanced_trade_fill.get('order_id')
            advanced_trade_fill_order_side = advanced_trade_fill.get('order_side')
            advanced_trade_fill_product_id = advanced_trade_fill.get('product_id')
            
            # Parse timestamp
            created_at = self._parse_timestamp(transaction_data.get('created_at'))
            
            return (
                import_id,
                user_id,
                transaction_id,
                transaction_data.get('type'),
                created_at,
                transaction_data.get('status'),
                transaction_data.get('resource'),
                transaction_data.get('resource_path'),
                amount_value,
                amount_currency,
                native_amount_value,
                native_amount_currency,
                advanced_trade_fill_commission,
                advanced_trade_fill_price,
                advanced_trade_fill_order_id,
                advanced_trade_fill_order_side,
                advanced_trade_fill_product_id,
                ingestion_time
            )
        except Exception as e:
            logger.error(f"Error transforming transaction record: {e}")
            return None
    
    @staticmethod
    def _safe_decimal(value: Any) -> Optional[Decimal]:
        """Safely convert value to Decimal."""
        if value is None:
            return None
        try:
            return Decimal(str(value))
        except (ValueError, TypeError):
            return None
    
    @staticmethod
    def _parse_timestamp(value: Any) -> Optional[datetime]:
        """Safely parse timestamp string to datetime."""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        try:
            # Try ISO format first
            return datetime.fromisoformat(value.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            try:
                # Try parsing as Unix timestamp
                return datetime.fromtimestamp(float(value))
            except (ValueError, TypeError):
                logger.warning(f"Could not parse timestamp: {value}")
                return None
    
    def close_connection(self):
        """Close database connection."""
        if self.connection and not self.connection.closed:
            self.connection.close()
            logger.info("PostgreSQL transformation connection closed")
    
    def __del__(self):
        """Ensure connection is closed when object is destroyed."""
        self.close_connection()

