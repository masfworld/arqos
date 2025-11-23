from extractor.coinbase_secrets import CoinbaseSecrets
from grpc_service.coinbase_importer_config import CoinbaseImporterConfig
import pytest


def test_get_api_key_from_config():
    """Test getting API key from configuration."""
    # Create a mock config with API key
    config = CoinbaseImporterConfig(
        coinbase_api_key="mock-api-key",
        coinbase_api_secret="mock-api-secret"
    )

    # Initialize CoinbaseSecrets with config
    secrets = CoinbaseSecrets(config)

    # Call get_api_key
    api_key = secrets.get_api_key()

    # Assertions
    assert api_key == "mock-api-key"


def test_get_api_secret_from_config():
    """Test getting API secret from configuration."""
    # Create a mock config with API secret
    config = CoinbaseImporterConfig(
        coinbase_api_key="mock-api-key",
        coinbase_api_secret="mock-api-secret"
    )

    # Initialize CoinbaseSecrets with config
    secrets = CoinbaseSecrets(config)

    # Call get_api_secret
    api_secret = secrets.get_api_secret()

    # Assertions
    assert api_secret == "mock-api-secret"


def test_get_api_key_missing():
    """Test error when API key is missing from configuration."""
    # Create config without API key
    config = CoinbaseImporterConfig(
        coinbase_api_key="",
        coinbase_api_secret="mock-secret"
    )

    # Initialize CoinbaseSecrets with config
    secrets = CoinbaseSecrets(config)

    # Attempt to get API key and expect an exception
    with pytest.raises(RuntimeError, match="Failed to retrieve the Coinbase API key"):
        secrets.get_api_key()


def test_get_api_secret_missing():
    """Test error when API secret is missing from configuration."""
    # Create config without API secret
    config = CoinbaseImporterConfig(
        coinbase_api_key="mock-key",
        coinbase_api_secret=""
    )

    # Initialize CoinbaseSecrets with config
    secrets = CoinbaseSecrets(config)

    # Attempt to get API secret and expect an exception
    with pytest.raises(RuntimeError, match="Failed to retrieve the Coinbase API secret"):
        secrets.get_api_secret()


def test_get_api_key_no_config():
    """Test error when no config is provided."""
    # Initialize CoinbaseSecrets without config
    secrets = CoinbaseSecrets()

    # Attempt to get API key and expect an exception
    with pytest.raises(RuntimeError, match="Failed to retrieve the Coinbase API key"):
        secrets.get_api_key()


def test_get_api_secret_no_config():
    """Test error when no config is provided."""
    # Initialize CoinbaseSecrets without config
    secrets = CoinbaseSecrets()

    # Attempt to get API secret and expect an exception
    with pytest.raises(RuntimeError, match="Failed to retrieve the Coinbase API secret"):
        secrets.get_api_secret()