"""
Coinbase Importer gRPC Manager
Manages importer configuration, status, and import execution.
"""

import logging
import threading
from datetime import datetime
from typing import Dict, Callable, Optional
from dataclasses import asdict

from grpc_service.coinbase_importer_config import CoinbaseImporterConfig, SourceStatus
from grpc_service.config_db_service import ConfigDBService
from helpers.import_history_service import ImportHistoryService

logger = logging.getLogger(__name__)


class GRPCManager:
    """Manages Coinbase importer configuration, status, and import execution."""
    
    def __init__(self, callbacks: Dict[str, Callable] = None):
        """
        Initialize GRPCManager.
        
        Configuration is now loaded from PostgreSQL database per user_id.
        
        Args:
            callbacks: Dictionary mapping source names to callback functions.
                      Example: {"app": coinbase_app_callback, "pro": coinbase_pro_callback}
        """
        self._lock = threading.Lock()
        self._callbacks = callbacks or {}  # Source name -> callback function
        # Status tracked per user_id: {user_id: {source: SourceStatus}}
        self._status: Dict[str, Dict[str, SourceStatus]] = {}
        # Running tasks tracked per user_id and source: {(user_id, source): Thread}
        self._running_tasks: Dict[tuple[str, str], threading.Thread] = {}
        
        # Initialize database service for config management
        self.config_db = ConfigDBService()
        # Initialize import history service
        self.import_history = ImportHistoryService()
        
    def get_config(self, user_id: str) -> Optional[CoinbaseImporterConfig]:
        """
        Get configuration for a specific user from database.
        
        Args:
            user_id: UUID of the user
            
        Returns:
            CoinbaseImporterConfig if found, None otherwise
        """
        try:
            return self.config_db.get_config(user_id)
        except Exception as e:
            logger.error(f"Error loading config for user_id {user_id}: {e}")
            raise
    
    def set_config(self, user_id: str, new_config: CoinbaseImporterConfig):
        """
        Save configuration for a specific user to database.
        
        Args:
            user_id: UUID of the user
            new_config: CoinbaseImporterConfig to save
        """
        try:
            self.config_db.save_config(user_id, new_config)
            # Log config without exposing secret
            config_dict = asdict(new_config)
            if 'coinbase_api_secret' in config_dict and config_dict['coinbase_api_secret']:
                config_dict['coinbase_api_secret'] = "********"
            logger.info(f"Configuration updated for user_id {user_id}: {config_dict}")
        except Exception as e:
            logger.error(f"Error saving config for user_id {user_id}: {e}")
            raise
    
    def get_status(self, user_id: str) -> Dict[str, SourceStatus]:
        """
        Get current status for all sources for a specific user.
        
        Args:
            user_id: UUID of the user
            
        Returns:
            Dictionary mapping source names to SourceStatus
        """
        with self._lock:
            if user_id not in self._status:
                # Return empty status if user has no status yet
                return {
                    "app": SourceStatus(),
                    "pro": SourceStatus()
                }
            return dict(self._status[user_id])
    
    def start_import(self, source: str, user_id: str = None) -> tuple[bool, str]:
        """
        Start an import for the specified source.
        
        Args:
            source: Source name ("app", "pro", or "all")
            user_id: UUID of the user for data isolation (required)
            
        Returns:
            (success, message) tuple
        """
        if not user_id:
            return False, "user_id is required to start import"
        
        with self._lock:
            # Validate that configuration exists for this user
            try:
                config = self.get_config(user_id)
                if not config:
                    return False, f"No Coinbase configuration found for user_id: {user_id}. Please configure Coinbase settings first using SetConfig."
                
                # Validate that API credentials are present
                if not config.coinbase_api_key or not config.coinbase_api_secret:
                    return False, f"Coinbase API credentials are missing for user_id: {user_id}. Please configure API key and secret using SetConfig."
            except Exception as e:
                return False, f"Error loading configuration: {str(e)}"
            
            sources = ["app", "pro"] if source == "all" else [source]
            
            # Initialize status for this user if not exists
            if user_id not in self._status:
                self._status[user_id] = {
                    "app": SourceStatus(),
                    "pro": SourceStatus()
                }
            
            for src in sources:
                if src not in self._callbacks:
                    return False, f"No callback registered for source: {src}"
                
                # Check if already running for this user
                task_key = (user_id, src)
                if task_key in self._running_tasks and self._running_tasks[task_key].is_alive():
                    return False, f"Import for {src} is already running for user_id: {user_id}"
                
                # Start import in a separate thread
                def run_import(src_name: str, uid: str):
                    """Run the import and update status."""
                    import_history_id = None
                    
                    with self._lock:
                        if uid not in self._status:
                            self._status[uid] = {
                                "app": SourceStatus(),
                                "pro": SourceStatus()
                            }
                        status = self._status[uid][src_name]
                        status.is_running = True
                        status.total_runs += 1
                    
                    try:
                        # Log import start
                        import_history_id = self.import_history.log_import_start(
                            user_id=uid,
                            importer_name='coinbase',
                            source=src_name
                        )
                        
                        logger.info(f"Starting import for {src_name} (user_id: {uid}, import_id: {import_history_id})")
                        
                        # Run the import callback and get statistics
                        stats = self._callbacks[src_name](user_id=uid, import_history_id=import_history_id)
                        
                        # Log import completion
                        self.import_history.log_import_completion(
                            import_id=import_history_id,
                            status='success',
                            rows_imported=stats.get('rows_imported', 0) if stats else 0,
                            metadata=stats.get('metadata', {}) if stats else {}
                        )
                        
                        with self._lock:
                            status.successful_runs += 1
                            status.last_run_time = datetime.now().isoformat()
                            status.last_error = ""
                        logger.info(f"Import for {src_name} completed successfully")
                    except Exception as e:
                        error_msg = str(e)
                        
                        # Log import failure
                        if import_history_id:
                            try:
                                self.import_history.log_import_completion(
                                    import_id=import_history_id,
                                    status='failed',
                                    rows_imported=0,
                                    error_message=error_msg,
                                    metadata={}
                                )
                            except Exception as log_error:
                                logger.error(f"Error logging import failure: {log_error}")
                        
                        with self._lock:
                            status.failed_runs += 1
                            status.last_error = error_msg
                        logger.error(f"Import for {src_name} failed: {e}")
                    finally:
                        with self._lock:
                            status.is_running = False
                            task_key = (uid, src_name)
                            if task_key in self._running_tasks:
                                del self._running_tasks[task_key]
                
                thread = threading.Thread(target=run_import, args=(src, user_id), daemon=True)
                self._running_tasks[task_key] = thread
                thread.start()
            
            return True, f"Import started for: {', '.join(sources)}"
    
    def stop_import(self, source: str, user_id: str = None) -> tuple[bool, str]:
        """
        Stop an import for the specified source.
        
        Args:
            source: Source name ("app", "pro", or "all")
            user_id: UUID of the user (optional, if not provided stops for all users)
            
        Returns:
            (success, message) tuple
        """
        with self._lock:
            sources = ["app", "pro"] if source == "all" else [source]
            stopped = []
            
            for src in sources:
                if user_id:
                    # Stop for specific user
                    task_key = (user_id, src)
                    if task_key in self._running_tasks and self._running_tasks[task_key].is_alive():
                        if user_id in self._status and src in self._status[user_id]:
                            self._status[user_id][src].is_running = False
                        stopped.append(f"{src} (user_id: {user_id})")
                else:
                    # Stop for all users
                    for task_key, thread in list(self._running_tasks.items()):
                        uid, src_name = task_key
                        if src_name == src and thread.is_alive():
                            if uid in self._status and src_name in self._status[uid]:
                                self._status[uid][src_name].is_running = False
                            stopped.append(f"{src_name} (user_id: {uid})")
            
            if stopped:
                return True, f"Import stop requested for: {', '.join(stopped)}"
            else:
                return False, f"No running imports found for: {source}"

