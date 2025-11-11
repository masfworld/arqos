from unittest.mock import patch
from extractor.coinbase_secrets import CoinbaseSecrets
import pytest


@patch("shared.utils.env_loader.get_coinbase_api_key")
def test_get_api_key_from_env(mock_get_api_key):
    """Test getting API key from environment variables."""
    # Mock the environment variable
    mock_get_api_key.return_value = "mock-api-key"

    # Initialize CoinbaseSecrets (no config needed)
    secrets = CoinbaseSecrets()

    # Call get_api_key
    api_key = secrets.get_api_key()

    # Assertions
    assert api_key == "mock-api-key"
    mock_get_api_key.assert_called_once()


@patch("shared.utils.env_loader.get_coinbase_api_secret")
def test_get_api_secret_from_env(mock_get_api_secret):
    """Test getting API secret from environment variables."""
    # Mock the environment variable
    mock_get_api_secret.return_value = "mock-api-secret"

    # Initialize CoinbaseSecrets
    secrets = CoinbaseSecrets()

    # Call get_api_secret
    api_secret = secrets.get_api_secret()

    # Assertions
    assert api_secret == "mock-api-secret"
    mock_get_api_secret.assert_called_once()


@patch("shared.utils.env_loader.get_coinbase_api_key")
def test_get_api_key_missing(mock_get_api_key):
    """Test error when API key is missing from environment."""
    # Mock missing environment variable
    mock_get_api_key.return_value = None

    # Initialize CoinbaseSecrets
    secrets = CoinbaseSecrets()

    # Attempt to get API key and expect an exception
    with pytest.raises(RuntimeError, match="Failed to retrieve the Coinbase API key"):
        secrets.get_api_key()


@patch("shared.utils.env_loader.get_coinbase_api_secret")
def test_get_api_secret_missing(mock_get_api_secret):
    """Test error when API secret is missing from environment."""
    # Mock missing environment variable
    mock_get_api_secret.return_value = None

    # Initialize CoinbaseSecrets
    secrets = CoinbaseSecrets()

    # Attempt to get API secret and expect an exception
    with pytest.raises(RuntimeError, match="Failed to retrieve the Coinbase API secret"):
        secrets.get_api_secret()