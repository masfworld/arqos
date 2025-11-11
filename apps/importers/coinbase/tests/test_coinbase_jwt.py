from unittest.mock import MagicMock, patch
from helpers.coinbase_jwt import get_coinbase_jwt

@patch("helpers.coinbase_jwt.jwt_generator")
def test_get_coinbase_jwt(mock_jwt_generator):
    """Test that query parameters are excluded when generating JWT."""
    # Mock secrets
    mock_secrets = MagicMock()
    mock_secrets.get_api_key.return_value = "mock-api-key"
    mock_secrets.get_api_secret.return_value = "mock-api-secret"

    # Mock JWT generator
    mock_jwt_generator.format_jwt_uri.return_value = "formatted-jwt-uri"
    mock_jwt_generator.build_rest_jwt.return_value = "mock-jwt-token"

    # Initialize authentication and call get_coinbase_jwt
    request_method = "GET"
    request_path = "/v2/accounts/a8e3c85a-c69d-5ed2-ad12-02b818278b69/transactions?starting_after=3bac0f52-8ace-5dd8-845b-35f3b870e6f1"
    jwt_token = get_coinbase_jwt(request_method, request_path, "mock-api-key", "mock-api-secret")

    # Assertions
    assert jwt_token == "mock-jwt-token"
    mock_jwt_generator.format_jwt_uri.assert_called_once_with(
        request_method, "/v2/accounts/a8e3c85a-c69d-5ed2-ad12-02b818278b69/transactions"
    )
    mock_jwt_generator.build_rest_jwt.assert_called_once_with(
        "formatted-jwt-uri", "mock-api-key", "mock-api-secret"
    )