import logging
from datetime import datetime

from extractor.coinbase_app_extractor import CoinbaseAppExtractor
from extractor.coinbase_pro_extractor import CoinbaseProExtractor
from extractor.coinbase_secrets import CoinbaseSecrets
from loader.postgres_writer import PostgresWriter
from helpers.import_history_service import ImportHistoryService
from helpers.coinbase_transformer import CoinbaseTransformer
from grpc_service.config_db_service import ConfigDBService
from grpc_service.coinbase_importer_config import CoinbaseImporterConfig

logger = logging.getLogger(__name__)


def extract_coinbase_app(postgres_writer: PostgresWriter, user_id: str = None, import_history_id: str = None):
    """
    Extract and process data from Coinbase App.
    
    Args:
        postgres_writer: PostgresWriter instance for writing data to PostgreSQL
        user_id: UUID of the user for data isolation (required)
        import_history_id: UUID of the import_history record for logging (required)
    
    Returns:
        dict: Statistics about the import including rows_imported and metadata
    """
    if not user_id:
        raise ValueError("user_id is required for Coinbase App extraction")
    if not import_history_id:
        raise ValueError("import_history_id is required for Coinbase App extraction")
    
    logger.info(f"Initializing Coinbase App extractor for user_id: {user_id}...")
    
    # Load configuration from database
    config_db = ConfigDBService()
    config = config_db.get_config(user_id)
    
    if not config:
        raise RuntimeError(f"No Coinbase configuration found for user_id: {user_id}. Please configure using SetConfig.")
    
    if not config.coinbase_api_key or not config.coinbase_api_secret:
        raise RuntimeError(f"Coinbase API credentials are missing for user_id: {user_id}. Please configure using SetConfig.")
    
    # Initialize secrets with config from database
    secrets = CoinbaseSecrets(config=config)
    extractor = CoinbaseAppExtractor(secrets=secrets)

    # Run the extraction process (no caching)
    accounts, transactions = extractor.run()

    # Write data to PostgreSQL raw tables and track row counts
    accounts_rows = postgres_writer.write_data("coinbase_app_accounts_raw", accounts, user_id=user_id, import_id=import_history_id)
    transactions_rows = postgres_writer.write_data("coinbase_app_transactions_raw", transactions, user_id=user_id, import_id=import_history_id)
    
    # Transform raw data to refined tables
    transformer = CoinbaseTransformer()
    try:
        accounts_transformed = transformer.transform_accounts(import_history_id, user_id)
        transactions_transformed = transformer.transform_transactions(import_history_id, user_id)
        logger.info(f"Transformed {accounts_transformed} accounts and {transactions_transformed} transactions")
    except Exception as e:
        logger.error(f"Error during transformation: {e}")
        # Don't fail the import if transformation fails, but log it
        accounts_transformed = 0
        transactions_transformed = 0
    finally:
        transformer.close_connection()
    
    total_rows = accounts_rows + transactions_rows
    
    # Return statistics
    return {
        'rows_imported': total_rows,
        'metadata': {
            'tables': {
                'coinbase_app_accounts_raw': accounts_rows,
                'coinbase_app_transactions_raw': transactions_rows,
                'coinbase_app_accounts': accounts_transformed,
                'coinbase_app_transactions': transactions_transformed
            },
            'source': 'app'
        }
    }


def extract_coinbase_pro_accounts(postgres_writer: PostgresWriter, user_id: str = None, import_history_id: str = None):
    """
    Extract and process Coinbase Pro accounts data.
    
    Args:
        postgres_writer: PostgresWriter instance for writing data to PostgreSQL
        user_id: UUID of the user for data isolation (required)
        import_history_id: UUID of the import_history record for logging (required)
    
    Returns:
        dict: Statistics about the import including rows_imported and metadata
    """
    if not user_id:
        raise ValueError("user_id is required for Coinbase Pro accounts extraction")
    if not import_history_id:
        raise ValueError("import_history_id is required for Coinbase Pro accounts extraction")
    
    logger.info(f"Initializing Coinbase Pro accounts extractor for user_id: {user_id}...")
    
    # Load configuration from database
    config_db = ConfigDBService()
    config = config_db.get_config(user_id)
    
    if not config:
        raise RuntimeError(f"No Coinbase configuration found for user_id: {user_id}. Please configure using SetConfig.")
    
    if not config.coinbase_pro_accounts_folder_path:
        raise RuntimeError(f"Coinbase Pro accounts folder path is not configured for user_id: {user_id}. Please configure using SetConfig.")
    
    extractor = CoinbaseProExtractor.create('accounts', config.coinbase_pro_accounts_folder_path)
    accounts = extractor.run()
    rows_imported = postgres_writer.write_data("coinbase_pro_accounts", accounts, user_id=user_id, import_id=import_history_id)
    extractor.cleanup()
    
    # Return statistics
    return {
        'rows_imported': rows_imported,
        'metadata': {
            'tables': {
                'coinbase_pro_accounts': rows_imported
            },
            'source': 'pro',
            'data_type': 'accounts',
            'folder_path': config.coinbase_pro_accounts_folder_path
        }
    }


def extract_coinbase_pro_fills(postgres_writer: PostgresWriter, user_id: str = None, import_history_id: str = None):
    """
    Extract and process Coinbase Pro fills data.
    
    Args:
        postgres_writer: PostgresWriter instance for writing data to PostgreSQL
        user_id: UUID of the user for data isolation (required)
        import_history_id: UUID of the import_history record for logging (required)
    
    Returns:
        dict: Statistics about the import including rows_imported and metadata
    """
    if not user_id:
        raise ValueError("user_id is required for Coinbase Pro fills extraction")
    if not import_history_id:
        raise ValueError("import_history_id is required for Coinbase Pro fills extraction")
    
    logger.info(f"Initializing Coinbase Pro fills extractor for user_id: {user_id}...")
    
    # Load configuration from database
    config_db = ConfigDBService()
    config = config_db.get_config(user_id)
    
    if not config:
        raise RuntimeError(f"No Coinbase configuration found for user_id: {user_id}. Please configure using SetConfig.")
    
    if not config.coinbase_pro_fills_folder_path:
        raise RuntimeError(f"Coinbase Pro fills folder path is not configured for user_id: {user_id}. Please configure using SetConfig.")
    
    extractor = CoinbaseProExtractor.create('fills', config.coinbase_pro_fills_folder_path)
    fills = extractor.run()
    rows_imported = postgres_writer.write_data("coinbase_pro_fills", fills, user_id=user_id, import_id=import_history_id)
    extractor.cleanup()
    
    # Return statistics
    return {
        'rows_imported': rows_imported,
        'metadata': {
            'tables': {
                'coinbase_pro_fills': rows_imported
            },
            'source': 'pro',
            'data_type': 'fills',
            'folder_path': config.coinbase_pro_fills_folder_path
        }
    }

