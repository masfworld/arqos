import json
import pytest
from unittest.mock import MagicMock, patch
import pandas as pd
from extractor.coinbase_app_extractor import CoinbaseAppExtractor
from coinbase.rest.types.accounts_types import Account

@pytest.fixture
def mock_secrets():
    """Fixture to mock CoinbaseSecrets."""
    mock_secrets = MagicMock()
    mock_secrets.get_api_key.return_value = "mock-api-key"
    mock_secrets.get_api_secret.return_value = "mock-api-secret"
    return mock_secrets

@patch("coinbase.rest.RESTClient")
def test_import_accounts(MockRESTClient):
    """Test the import_accounts method with paginated accounts."""
    # Mock RESTClient instance
    mock_rest_client_instance = MockRESTClient.return_value

    # Mock paginated response
    mock_response1 = MagicMock()
    mock_response1.accounts = ["Account1", "Account2"]
    mock_response1.cursor = "cursor1"
    mock_response1.has_next = True

    mock_response2 = MagicMock()
    mock_response2.accounts = ["Account3"]
    mock_response2.cursor = None
    mock_response2.has_next = False

    # Mock client.get_accounts side effects
    mock_rest_client_instance.get_accounts.side_effect = [mock_response1, mock_response2]

    # Call import_accounts
    accounts = CoinbaseAppExtractor.import_accounts(mock_rest_client_instance)

    # Assertions
    assert accounts == ["Account1", "Account2", "Account3"]
    assert mock_rest_client_instance.get_accounts.call_count == 2
    mock_rest_client_instance.get_accounts.assert_any_call(cursor="cursor1")

@patch("extractor.coinbase_app_extractor.get_coinbase_jwt")
@patch("requests.get")
def test_fetch_transactions(mock_requests_get, mock_get_coinbase_jwt):
    """Test the fetch_transactions method with paginated transactions."""
    # Mock JWT generation
    mock_get_coinbase_jwt.return_value = "mock-jwt-token"

    # Mock paginated response
    mock_response1 = MagicMock()
    mock_response1.json.return_value = {
        "data": [{"id": "txn1"}, {"id": "txn2"}],
        "pagination": {"next_uri": "/next-page"}
    }
    mock_response2 = MagicMock()
    mock_response2.json.return_value = {
        "data": [{"id": "txn3"}],
        "pagination": {"next_uri": None}
    }

    # Mock requests.get side effects
    mock_requests_get.side_effect = [mock_response1, mock_response2]

    # Call fetch_transactions
    transactions = CoinbaseAppExtractor.fetch_transactions(
        account_id="mock-account-id",
        api_key="mock-api-key",
        api_secret="mock-api-secret"
    )

    # Assertions
    assert transactions == [{"id": "txn1"}, {"id": "txn2"}, {"id": "txn3"}]
    assert mock_requests_get.call_count == 2
    mock_get_coinbase_jwt.assert_called()
    mock_requests_get.assert_any_call(
        "https://api.coinbase.com/v2/accounts/mock-account-id/transactions?limit=100",
        headers={"Authorization": "Bearer mock-jwt-token"}
    )
    mock_requests_get.assert_any_call(
        "https://api.coinbase.com/next-page?limit=100",
        headers={"Authorization": "Bearer mock-jwt-token"}
    )

@patch("coinbase.rest.RESTClient")
@patch("extractor.coinbase_app_extractor.CoinbaseAppExtractor.fetch_transactions")
@patch("extractor.coinbase_app_extractor.CoinbaseAppExtractor.import_accounts")
def test_run(mock_import_accounts, mock_fetch_transactions, MockRESTClient, mock_secrets):
    """Test the run method with DataFrame outputs containing only one column named 'data'."""
    # Mock RESTClient instance
    mock_rest_client_instance = MockRESTClient.return_value

    account_1 = Account(uuid="uuid1", name="Account1")
    account_2 = Account(uuid="uuid2", name="Account2")
    mock_import_accounts.return_value = [account_1, account_2]




    # Mock fetch_transactions to return transactions per account
    mock_fetch_transactions.side_effect = [
        [
            {'amount': {'amount': '0.5313', 'currency': 'EOS'
                }, 'created_at': '2022-11-30T18: 02: 29Z', 'id': '1',
            },
            {'amount': {'amount': '-0.5313', 'currency': 'EOS'
                }, 'created_at': '2020-03-05T20: 44: 22Z', 'id': '2'
            }
        ],  # Transactions for Account 1
        [
            {'amount': {'amount': '0.5313', 'currency': 'EOS'
                }, 'created_at': '2022-12-31T18: 02: 29Z', 'id': '3',
            }
        ]           # Transactions for Account 2
    ]

    # Initialize and run
    app = CoinbaseAppExtractor(secrets=mock_secrets)
    accounts_df, transactions_df = app.run()

    # Test accounts DataFrame
    assert isinstance(accounts_df, pd.DataFrame)
    assert len(accounts_df) == 2
    assert list(accounts_df.columns) == ["data"]
    assert json.loads(accounts_df.iloc[0]["data"]) == {'name': 'Account1', 'uuid': 'uuid1'}
    assert json.loads(accounts_df.iloc[1]["data"]) == {'name': 'Account2', 'uuid': 'uuid2'}

    # Test transactions DataFrame
    assert isinstance(transactions_df, pd.DataFrame)
    assert len(transactions_df) == 3
    assert list(transactions_df.columns) == ["data"]
    assert json.loads(transactions_df.iloc[0]["data"]) == {'amount': {'amount': '0.5313', 'currency': 'EOS'
                }, 'created_at': '2022-11-30T18: 02: 29Z', 'id': '1',
            }
    assert json.loads(transactions_df.iloc[1]["data"]) == {'amount': {'amount': '-0.5313', 'currency': 'EOS'
                }, 'created_at': '2020-03-05T20: 44: 22Z', 'id': '2'
            }
    assert json.loads(transactions_df.iloc[2]["data"]) == {'amount': {'amount': '0.5313', 'currency': 'EOS'
                }, 'created_at': '2022-12-31T18: 02: 29Z', 'id': '3',
            }