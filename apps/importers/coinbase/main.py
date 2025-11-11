import logging
import logging.config
import sys
import signal
from pathlib import Path

# Load environment configuration
from shared.utils.env_loader import load_environment

# Load environment variables
# load_environment(project_root)
load_environment()

logging.config.fileConfig("logging.ini")

from loader.postgres_writer import PostgresWriter
from helpers.coinbase_extractors import (
    extract_coinbase_app,
    extract_coinbase_pro_accounts,
    extract_coinbase_pro_fills
)

# Load logging configuration
logger = logging.getLogger(__name__)

# Import gRPC services
from grpc_service.grpc_server import create_grpc_server

# Global variables for graceful shutdown
grpc_server = None
config_manager = None

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully."""
    logger.info(f"Received signal {signum}, shutting down gracefully...")
    shutdown_services()
    sys.exit(0)

def shutdown_services():
    """Shutdown gRPC server."""
    global grpc_server
    
    if grpc_server:
        logger.info("Stopping gRPC server...")
        grpc_server.stop()

def main():
    global grpc_server, config_manager
    
    # Set up signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Inject dependencies using centralized config
    postgres_writer = PostgresWriter()

    # Create data collection callbacks
    def coinbase_app_callback(user_id: str = None, import_history_id: str = None):
        """Callback for Coinbase App import."""
        return extract_coinbase_app(postgres_writer, user_id=user_id, import_history_id=import_history_id)
    
    def coinbase_pro_callback(user_id: str = None, import_history_id: str = None):
        """Callback for Coinbase Pro import."""
        fills_stats = extract_coinbase_pro_fills(postgres_writer, user_id=user_id, import_history_id=import_history_id)
        accounts_stats = extract_coinbase_pro_accounts(postgres_writer, user_id=user_id, import_history_id=import_history_id)
        # Combine statistics
        return {
            'rows_imported': fills_stats['rows_imported'] + accounts_stats['rows_imported'],
            'metadata': {
                'fills': fills_stats['metadata'],
                'accounts': accounts_stats['metadata'],
                'source': 'pro'
            }
        }
    
    # Setup callbacks for imports via gRPC
    # Using "app" and "pro" as source names to match the simplified interface
    callbacks = {
        "app": coinbase_app_callback,
        "pro": coinbase_pro_callback
    }
    
    # Create gRPC server with callbacks
    grpc_server = create_grpc_server(callbacks=callbacks)
    
    # Start gRPC server
    try:
        grpc_server.start()
    except Exception as e:
        logger.error(f"Failed to start gRPC server: {e}")
        return

    # Run gRPC server - imports will be triggered by external clients (backend scheduler)
    logger.info("Coinbase Importer gRPC Service is running.")
    logger.info("Imports will not start automatically - use gRPC clients (e.g., backend scheduler) to trigger imports.")
    try:
        grpc_server.wait_for_termination()
    except KeyboardInterrupt:
        logger.info("Received interrupt, shutting down...")
        shutdown_services()


if __name__ == "__main__":
    main()