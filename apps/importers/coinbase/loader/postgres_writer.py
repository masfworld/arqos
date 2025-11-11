import psycopg2
from psycopg2.extras import RealDictCursor
import pandas as pd
import logging

from shared.utils.env_loader import get_database_config

logger = logging.getLogger(__name__)

class PostgresWriter:
    def __init__(self):
        """
        Initialize PostgresWriter with database configuration.
        
        Args:
            db_config: Dictionary with database configuration keys:
                - host: Database host
                - port: Database port
                - database: Database name
                - user: Database user
                - password: Database password
                - schema: Database schema
        """
        self.db_config = get_database_config()
        self.connection = None
        
    def _get_connection(self):
        """Get or create database connection"""
        if self.connection is None or self.connection.closed:
            try:
                self.connection = psycopg2.connect(
                    host=self.db_config['host'],
                    port=self.db_config['port'],
                    database=self.db_config['database'],
                    user=self.db_config['user'],
                    password=self.db_config['password']
                )
                logger.info("Connected to PostgreSQL database")
            except Exception as e:
                logger.error(f"Error connecting to PostgreSQL: {e}")
                raise
        return self.connection

    def initialize_tables(self, table_name: str):
        """Create tables if they don't exist - tables are now created via Docker init scripts"""
        # Tables are created by the docker/create_tables.sql script
        # This method is kept for backward compatibility but does nothing
        logger.info(f"Tables are managed by Docker init scripts - skipping initialization for '{table_name}'")

    def write_data(self, table_name: str, df: pd.DataFrame, user_id: str = None, import_id: str = None):
        """
        Write DataFrame to PostgreSQL table.
        
        Args:
            table_name: Name of the table to write to
            df: DataFrame containing data to write
            user_id: UUID of the user (optional, will be added if not in DataFrame)
            import_id: UUID of the import_history record (optional, will be added if not in DataFrame)
        
        Returns:
            int: Number of rows written
        """
        if df.empty:
            logger.warning(f"DataFrame for table '{table_name}' is empty, skipping write")
            return 0
            
        self.initialize_tables(table_name)
        
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            # Add ingestion_time if not present
            if 'ingestion_time' not in df.columns:
                df['ingestion_time'] = pd.Timestamp.now()
            
            # Add user_id if not present and provided
            if user_id and 'user_id' not in df.columns:
                df['user_id'] = user_id
            
            # Add import_id if not present and provided
            if import_id and 'import_id' not in df.columns:
                df['import_id'] = import_id
            
            # Convert DataFrame to list of tuples for insertion
            # Use 'coinbase' schema for coinbase tables, otherwise use configured schema
            if table_name.startswith('coinbase_'):
                table_schema = 'coinbase'
            else:
                table_schema = self.db_config.get('schema', 'public')
            full_table_name = f"{table_schema}.{table_name}"
            
            # Get column names and prepare data
            columns = list(df.columns)
            placeholders = ', '.join(['%s'] * len(columns))
            insert_sql = f"INSERT INTO {full_table_name} ({', '.join(columns)}) VALUES ({placeholders})"
            
            # Convert DataFrame to list of tuples
            data_tuples = [tuple(row) for row in df.to_numpy()]
            rows_written = len(data_tuples)
            
            # Execute batch insert
            cursor.executemany(insert_sql, data_tuples)
            conn.commit()
            
            logger.info(f"Successfully inserted {rows_written} records into '{full_table_name}'")
            return rows_written
            
        except Exception as e:
            logger.error(f"Error writing data to PostgreSQL table '{table_name}': {e}")
            conn.rollback()
            raise
        finally:
            cursor.close()

    def close_connection(self):
        """Close database connection"""
        if self.connection and not self.connection.closed:
            self.connection.close()
            logger.info("PostgreSQL connection closed")

    def __del__(self):
        """Ensure connection is closed when object is destroyed"""
        self.close_connection()
