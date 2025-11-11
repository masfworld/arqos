"""
Import History Service
Service for logging import history to analytics.import_history table.
This service is importer-agnostic and can be used by any importer (coinbase, binance, etc.).
"""

import psycopg2
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from shared.utils.env_loader import get_database_config

logger = logging.getLogger(__name__)


class ImportHistoryService:
    """Service for logging import history to PostgreSQL database."""
    
    def __init__(self):
        """Initialize ImportHistoryService with database configuration."""
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
                logger.debug("Connected to PostgreSQL database for import history")
            except Exception as e:
                logger.error(f"Error connecting to PostgreSQL: {e}")
                raise
        return self.connection
    
    def log_import_start(
        self,
        user_id: str,
        importer_name: str,
        source: str
    ) -> str:
        """
        Log the start of an import and return the import_history_id.
        
        Args:
            user_id: UUID of the user
            importer_name: Name of the importer (e.g., 'coinbase', 'binance')
            source: Source name (e.g., 'app', 'pro', 'all')
            
        Returns:
            UUID string of the created import_history record
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            query = """
                INSERT INTO analytics.import_history 
                    (user_id, importer_name, source, status, start_time)
                VALUES (%s, %s, %s, 'running', %s)
                RETURNING id
            """
            start_time = datetime.now(timezone.utc)
            cursor.execute(query, (user_id, importer_name, source, start_time))
            import_id = cursor.fetchone()[0]
            conn.commit()
            
            logger.info(f"Logged import start: id={import_id}, user_id={user_id}, importer={importer_name}, source={source}")
            return str(import_id)
            
        except Exception as e:
            logger.error(f"Error logging import start: {e}")
            conn.rollback()
            raise
        finally:
            cursor.close()
    
    def log_import_completion(
        self,
        import_id: str,
        status: str,
        rows_imported: int = 0,
        error_message: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Log the completion of an import.
        
        Args:
            import_id: UUID of the import_history record (from log_import_start)
            status: Status of the import ('success' or 'failed')
            rows_imported: Total number of rows imported
            error_message: Error message if status is 'failed'
            metadata: Additional metadata as dictionary (will be stored as JSONB)
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            # Get start_time to calculate execution_time
            cursor.execute(
                "SELECT start_time FROM analytics.import_history WHERE id = %s",
                (import_id,)
            )
            result = cursor.fetchone()
            
            if not result:
                logger.warning(f"Import history record not found: {import_id}")
                return
            
            start_time = result[0]
            end_time = datetime.now(timezone.utc)
            execution_time = (end_time - start_time).total_seconds()
            
            # Prepare metadata JSON
            metadata_json = json.dumps(metadata) if metadata else None
            
            query = """
                UPDATE analytics.import_history
                SET 
                    status = %s,
                    end_time = %s,
                    execution_time_seconds = %s,
                    rows_imported = %s,
                    error_message = %s,
                    metadata = %s::jsonb
                WHERE id = %s
            """
            
            cursor.execute(query, (
                status,
                end_time,
                execution_time,
                rows_imported,
                error_message,
                metadata_json,
                import_id
            ))
            conn.commit()
            
            logger.info(f"Logged import completion: id={import_id}, status={status}, rows={rows_imported}, time={execution_time:.3f}s")
            
        except Exception as e:
            logger.error(f"Error logging import completion: {e}")
            conn.rollback()
            raise
        finally:
            cursor.close()
    
    def close_connection(self):
        """Close database connection."""
        if self.connection and not self.connection.closed:
            self.connection.close()
            logger.debug("PostgreSQL import history connection closed")

