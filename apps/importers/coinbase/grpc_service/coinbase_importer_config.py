"""
Coinbase Importer Configuration
Defines configuration dataclasses for the Coinbase importer.
"""

from dataclasses import dataclass
from typing import Dict


@dataclass
class SourceStatus:
    """Status for a specific import source (app/pro)."""
    is_running: bool = False
    last_run_time: str = ""
    last_error: str = ""
    total_runs: int = 0
    successful_runs: int = 0
    failed_runs: int = 0


@dataclass
class CoinbaseImporterConfig:
    """Configuration for the Coinbase importer (Coinbase-specific settings only)."""
    # Coinbase API credentials
    coinbase_api_key: str = ""
    coinbase_api_secret: str = ""
    
    # Coinbase Pro file paths
    coinbase_pro_accounts_folder_path: str = ""
    coinbase_pro_fills_folder_path: str = ""
    
    # Additional settings (reserved for future use)
    settings: Dict[str, str] = None  # Additional settings as key-value pairs
    
    def __post_init__(self):
        if self.settings is None:
            self.settings = {}

