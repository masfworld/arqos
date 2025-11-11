import json
import logging
import requests
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from coinbase.rest import RESTClient
from coinbase.rest.types.accounts_types import ListAccountsResponse, Account
from requests import Response

from extractor.coinbase_secrets import CoinbaseSecrets
from helpers.coinbase_jwt import get_coinbase_jwt
from itertools import chain
import pandas as pd

logger = logging.getLogger(__name__)
REQUEST_LIMIT = 100 #https://docs.cdp.coinbase.com/coinbase-app/docs/pagination

class CoinbaseAppExtractor:
    """
    This class is the responsible to extract all transactions for all accounts in Coinbase App is the new name for Coinbase
    """
    def __init__(self, secrets: CoinbaseSecrets = None):
        """
        Initialize the CoinbaseAppExtractor class.

        Args:
            secrets (CoinbaseSecrets): Instance of CoinbaseSecrets (optional, for dependency injection).
        """
        logger.info("Initializing CoinbaseAppExtractor...")
        self.secrets = secrets

    def run(self) -> tuple[pd.DataFrame, pd.DataFrame]:
        """
        Execute the ingestion process.

        Returns:
            tuple[pd.DataFrame, pd.DataFrame]: DataFrames with accounts and transactions.
        """
        try:
            logger.info("Starting the ingestion process...")
            api_key = self.secrets.get_api_key()
            api_secret = self.secrets.get_api_secret()

            client = RESTClient(api_key=api_key, api_secret=api_secret)
            accounts = self.import_accounts(client)

            accounts_data = []
            transactions_data = []

            for account in accounts:
                # Convert account to a dictionary (or JSON)
                account_json = json.dumps(account.to_dict())
                accounts_data.append(account_json)

                # Fetch transactions for the account
                transactions = self.fetch_transactions(account.uuid, api_key, api_secret)
                transactions_data.extend(transactions)

            # Create DataFrames
            accounts_df = pd.DataFrame({"data": accounts_data})
            transactions_df = pd.DataFrame({"data": [json.dumps(tx) for tx in transactions_data]})

            return accounts_df, transactions_df

        except RuntimeError as e:
            logger.error(f"An error occurred during the ingestion process: {e}")
            raise

    @staticmethod
    def import_accounts(client: RESTClient)-> list[Account]:
        """
        Fetch all accounts for a given account from the Coinbase API.
        There is pagination managed by
        https://docs.cdp.coinbase.com/coinbase-app/docs/api-accounts#list-accounts

        Args:
            client (RESTClient): Coinbase SDK Rest client object to make requests.
        Returns:
            list(Account): A list of all accounts.
        """

        try:
            response: ListAccountsResponse = client.get_accounts(limit= REQUEST_LIMIT)
            accounts_result = []
            while response:
                # Process accounts in the current page
                accounts = response.accounts
                for account in accounts:
                    if account:
                        logger.debug(f"Account: {account}\n")
                        accounts_result.append(account)

                # Log pagination info
                logger.debug(f"Cursor: {response.cursor}")
                logger.debug(f"Size: {response.size}")
                logger.debug(f"Has next: {response.has_next}")

                # If there are more pages, fetch the next page using the cursor
                if response.has_next:
                    response = client.get_accounts(cursor=response.cursor)
                else:
                    break
            return accounts_result

        except RuntimeError as e:
            logger.error(f"An error occurred importing accounts: {e}")
            raise

    @staticmethod
    def fetch_transactions(account_id: str, api_key: str, api_secret: str)-> list[str]:
        """
        Fetch all transactions for a given account from the Coinbase API, handling pagination.
        https://docs.cdp.coinbase.com/coinbase-app/docs/api-transactions#list-transactions

        Args:
            account_id (str): The ID of the Coinbase account.
            api_key (str): Coinbase API Key.
            api_secret (str): Coinbase API Secret.

        Returns:
            list (list[str]): A list of all transactions.
        """
        base_url = "https://api.coinbase.com"
        transactions = []
        next_uri = f"/v2/accounts/{account_id}/transactions"  # Initial URI

        while next_uri:
            # Ensure limit=100 is included in the URI
            parsed_url = urlparse(next_uri)
            query_params = parse_qs(parsed_url.query)
            query_params["limit"] = str(REQUEST_LIMIT)
            next_uri = str(urlunparse(parsed_url._replace(query=urlencode(query_params, doseq=True))))

            # Generate a JWT token for the current request
            logger.debug(f"Transactions next uri: {next_uri}")
            jwt_token = get_coinbase_jwt("GET", next_uri, api_key, api_secret)

            url = f"{base_url}{next_uri}"
            headers = {
                "Authorization": f"Bearer {jwt_token}"
            }

            try:
                response: Response = requests.get(url, headers=headers)
                response.raise_for_status()  # Raise an exception for HTTP errors
                data = response.json()
                logger.debug(f"Transactions response: {data}")

                # Extract transactions and pagination info
                transactions.extend(data.get("data", []))  # Append current page's transactions
                next_uri = data.get("pagination", {}).get("next_uri")  # Get the next page URI
                logger.debug(f"Transactions pagination: {data.get("pagination")}")

            except requests.exceptions.RequestException as e:
                logger.error(f"Error fetching transactions: {e}")
                raise

        # Flatten the transactions list
        return transactions