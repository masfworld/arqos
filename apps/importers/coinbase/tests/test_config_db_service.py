"""
Unit tests for ConfigDBService
"""

import pytest
from unittest.mock import MagicMock, patch, Mock
from grpc_service.config_db_service import ConfigDBService
from grpc_service.coinbase_importer_config import CoinbaseImporterConfig


@pytest.fixture
def mock_db_connection():
    """Create a mock database connection."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value = mock_cursor
    mock_conn.closed = False
    return mock_conn, mock_cursor


@patch('grpc_service.config_db_service.get_database_config')
@patch('grpc_service.config_db_service.psycopg2.connect')
def test_get_config_success(mock_connect, mock_get_db_config, mock_db_connection):
    """Test successful config retrieval from database."""
    mock_conn, mock_cursor = mock_db_connection
    mock_connect.return_value = mock_conn
    mock_get_db_config.return_value = {
        'host': 'localhost',
        'port': 5432,
        'database': 'test_db',
        'user': 'test_user',
        'password': 'test_password'
    }
    
    # Mock database query result
    mock_cursor.fetchall.return_value = [
        ('coinbase', 'api_key_1', 'api_secret_1', '{"settings": {"key": "value"}}'),
        ('coinbase_app', 'api_key_2', 'api_secret_2', '{"coinbase_pro_accounts_folder_path": "/path/to/accounts"}'),
    ]
    
    service = ConfigDBService()
    service.connection = mock_conn
    config = service.get_config('user-123')
    
    assert config is not None
    assert isinstance(config, CoinbaseImporterConfig)
    assert config.coinbase_api_key == 'api_key_1'  # First non-null key
    assert config.coinbase_api_secret == 'api_secret_1'  # First non-null secret
    assert config.coinbase_pro_accounts_folder_path == '/path/to/accounts'
    assert config.settings == {'key': 'value'}
    
    # Verify query was called with correct parameters
    mock_cursor.execute.assert_called_once()
    call_args = mock_cursor.execute.call_args[0]
    assert 'coinbase' in call_args[0].lower()
    assert call_args[1] == ('user-123',)


@patch('grpc_service.config_db_service.get_database_config')
@patch('grpc_service.config_db_service.psycopg2.connect')
def test_get_config_no_results(mock_connect, mock_get_db_config, mock_db_connection):
    """Test config retrieval when no configs exist."""
    mock_conn, mock_cursor = mock_db_connection
    mock_connect.return_value = mock_conn
    mock_get_db_config.return_value = {
        'host': 'localhost',
        'port': 5432,
        'database': 'test_db',
        'user': 'test_user',
        'password': 'test_password'
    }
    
    # Mock empty result
    mock_cursor.fetchall.return_value = []
    
    service = ConfigDBService()
    service.connection = mock_conn
    config = service.get_config('user-123')
    
    assert config is None


@patch('grpc_service.config_db_service.get_database_config')
@patch('grpc_service.config_db_service.psycopg2.connect')
def test_get_config_merges_multiple_sources(mock_connect, mock_get_db_config, mock_db_connection):
    """Test that configs from multiple sources are properly merged."""
    mock_conn, mock_cursor = mock_db_connection
    mock_connect.return_value = mock_conn
    mock_get_db_config.return_value = {
        'host': 'localhost',
        'port': 5432,
        'database': 'test_db',
        'user': 'test_user',
        'password': 'test_password'
    }
    
    # Mock multiple config sources
    mock_cursor.fetchall.return_value = [
        ('coinbase', None, None, '{"settings": {"global": "value"}}'),
        ('coinbase_app', 'app_key', 'app_secret', '{"coinbase_pro_accounts_folder_path": "/app/path"}'),
        ('coinbase_pro', 'pro_key', 'pro_secret', '{"coinbase_pro_fills_folder_path": "/pro/path"}'),
    ]
    
    service = ConfigDBService()
    service.connection = mock_conn
    config = service.get_config('user-123')
    
    assert config is not None
    # Should use first non-null API key/secret (from coinbase_app)
    assert config.coinbase_api_key == 'app_key'
    assert config.coinbase_api_secret == 'app_secret'
    # Should merge config_data from all sources
    assert config.coinbase_pro_accounts_folder_path == '/app/path'
    assert config.coinbase_pro_fills_folder_path == '/pro/path'
    assert config.settings == {'global': 'value'}


@patch('grpc_service.config_db_service.get_database_config')
@patch('grpc_service.config_db_service.psycopg2.connect')
def test_save_config_success(mock_connect, mock_get_db_config, mock_db_connection):
    """Test successful config save to database."""
    mock_conn, mock_cursor = mock_db_connection
    mock_connect.return_value = mock_conn
    mock_get_db_config.return_value = {
        'host': 'localhost',
        'port': 5432,
        'database': 'test_db',
        'user': 'test_user',
        'password': 'test_password'
    }
    
    config = CoinbaseImporterConfig(
        coinbase_api_key='test_key',
        coinbase_api_secret='test_secret',
        coinbase_pro_accounts_folder_path='/path/to/accounts',
        coinbase_pro_fills_folder_path='/path/to/fills',
        settings={'key': 'value'}
    )
    
    service = ConfigDBService()
    service.connection = mock_conn
    result = service.save_config('user-123', config)
    
    assert result is True
    mock_cursor.execute.assert_called_once()
    mock_conn.commit.assert_called_once()
    
    # Verify the query includes the correct values
    call_args = mock_cursor.execute.call_args[0]
    assert 'INSERT INTO exchanges.exchange_configs' in call_args[0]
    assert call_args[1][0] == 'user-123'  # user_id
    assert call_args[1][1] == 'test_key'  # api_key
    assert call_args[1][2] == 'test_secret'  # api_secret


@patch('grpc_service.config_db_service.get_database_config')
@patch('grpc_service.config_db_service.psycopg2.connect')
def test_save_config_rollback_on_error(mock_connect, mock_get_db_config, mock_db_connection):
    """Test that save_config rolls back on error."""
    mock_conn, mock_cursor = mock_db_connection
    mock_connect.return_value = mock_conn
    mock_get_db_config.return_value = {
        'host': 'localhost',
        'port': 5432,
        'database': 'test_db',
        'user': 'test_user',
        'password': 'test_password'
    }
    
    # Make execute raise an error
    mock_cursor.execute.side_effect = Exception("Database error")
    
    config = CoinbaseImporterConfig(
        coinbase_api_key='test_key',
        coinbase_api_secret='test_secret'
    )
    
    service = ConfigDBService()
    service.connection = mock_conn
    
    with pytest.raises(Exception):
        service.save_config('user-123', config)
    
    mock_conn.rollback.assert_called_once()
    mock_conn.commit.assert_not_called()


@patch('grpc_service.config_db_service.get_database_config')
@patch('grpc_service.config_db_service.psycopg2.connect')
def test_close_connection(mock_connect, mock_get_db_config, mock_db_connection):
    """Test closing database connection."""
    mock_conn, mock_cursor = mock_db_connection
    mock_connect.return_value = mock_conn
    mock_get_db_config.return_value = {
        'host': 'localhost',
        'port': 5432,
        'database': 'test_db',
        'user': 'test_user',
        'password': 'test_password'
    }
    
    service = ConfigDBService()
    service.connection = mock_conn
    service.close_connection()
    
    mock_conn.close.assert_called_once()


@patch('grpc_service.config_db_service.get_database_config')
@patch('grpc_service.config_db_service.psycopg2.connect')
def test_get_connection_reuses_existing(mock_connect, mock_get_db_config, mock_db_connection):
    """Test that _get_connection reuses existing connection."""
    mock_conn, mock_cursor = mock_db_connection
    mock_connect.return_value = mock_conn
    mock_get_db_config.return_value = {
        'host': 'localhost',
        'port': 5432,
        'database': 'test_db',
        'user': 'test_user',
        'password': 'test_password'
    }
    
    service = ConfigDBService()
    conn1 = service._get_connection()
    conn2 = service._get_connection()
    
    assert conn1 is conn2
    assert mock_connect.call_count == 1  # Should only connect once

