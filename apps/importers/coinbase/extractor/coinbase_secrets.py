import logging
from grpc_service.coinbase_importer_config import CoinbaseImporterConfig

logger = logging.getLogger(__name__)

class CoinbaseSecrets:
    def __init__(self, config: CoinbaseImporterConfig = None):
        """
        Initialize the CoinbaseSecrets class.
        
        Args:
            config: CoinbaseImporterConfig instance with API credentials.
                   If not provided, will raise error when trying to get credentials.
        """
        self.config = config
        if config:
            logger.info("CoinbaseSecrets initialized with provided configuration.")
        else:
            logger.warning("CoinbaseSecrets initialized without configuration. Credentials must be provided via config.")

    def get_api_key(self) -> str:
        """
        Get the Coinbase API key from configuration.

        Returns:
            str: The API key.

        Raises:
            RuntimeError: If the API key cannot be retrieved.
        """
        try:
            if not self.config:
                raise ValueError("No configuration provided to CoinbaseSecrets")
            
            api_key = self.config.coinbase_api_key
            if not api_key:
                raise ValueError("Coinbase API key not found in configuration. Please configure using SetConfig.")
            logger.info("Coinbase API key retrieved from configuration.")
            return api_key
        except Exception as e:
            logger.error("Failed to retrieve the Coinbase API key.", exc_info=True)
            raise RuntimeError("Failed to retrieve the Coinbase API key.") from e

    def get_api_secret(self) -> str:
        """
        Get the Coinbase API secret from configuration.

        Returns:
            str: The API secret.

        Raises:
            RuntimeError: If the API secret cannot be retrieved.
        """
        try:
            if not self.config:
                raise ValueError("No configuration provided to CoinbaseSecrets")
            
            api_secret = self.config.coinbase_api_secret
            if not api_secret:
                raise ValueError("Coinbase API secret not found in configuration. Please configure using SetConfig.")
            logger.info("Coinbase API secret retrieved from configuration.")
            return api_secret
        except Exception as e:
            logger.error("Failed to retrieve the Coinbase API secret.", exc_info=True)
            raise RuntimeError("Failed to retrieve the Coinbase API secret.") from e