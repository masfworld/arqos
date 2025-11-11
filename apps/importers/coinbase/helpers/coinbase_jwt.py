from coinbase import jwt_generator
from urllib.parse import urlparse
import logging

logger = logging.getLogger(__name__)

def get_coinbase_jwt(request_method: str, request_path: str, api_key: str, api_secret: str) -> str:
    """
    Get JWT from path

    Args:
        request_method (str): GET/POST/...
        request_path (str): If the URI has a UUID in the path you should include that UUID here, e.g., /v2/accounts/f603f97c-37d7-4e58-b264-c27e9e393dd9/addresses. Query parameters will be excluded.
        api_key: "organizations/{org_id}/apiKeys/{key_id}"
        api_secret: "-----BEGIN EC PRIVATE KEY-----\nYOUR PRIVATE KEY\n-----END EC PRIVATE KEY-----\n"

    Returns:
        str: JWT used in Authentication Bearer

    """

    # Parse the URL and exclude query parameters
    parsed_url = urlparse(request_path)
    path_without_query = parsed_url.path
    logger.debug(f"Generating JWT for path: {path_without_query}")

    decode_secret: str = api_secret.encode("utf-8").decode("unicode_escape")
    jwt_uri = jwt_generator.format_jwt_uri(request_method, path_without_query)
    return jwt_generator.build_rest_jwt(jwt_uri, api_key, decode_secret)
