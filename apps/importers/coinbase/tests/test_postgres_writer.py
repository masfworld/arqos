"""
Unit tests for PostgresWriter
"""

import pytest
import pandas as pd
from unittest.mock import MagicMock, patch
from loader.postgres_writer import PostgresWriter


@pytest.fixture
def mock_db_connection():
    """Create a mock database connection."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value = mock_cursor
    mock_conn.closed = False
    return mock_conn, mock_cursor


@patch('loader.postgres_writer.get_database_config')
@patch('loader.postgres_writer.psycopg2.connect')
def test_write_data_success(mock_connect, mock_get_db_config, mock_db_connection):
    """Test successful data write to PostgreSQL."""
    mock_conn, mock_cursor = mock_db_connection
    mock_connect.return_value = mock_conn
    mock_get_db_config.return_value = {
        'host': 'localhost',
        'port': 5432,
        'database': 'test_db',
        'user': 'test_user',
        'password': 'test_password',
        'schema': 'public'
    }
    
    # Create test DataFrame
    df = pd.DataFrame({
        'id': [1, 2, 3],
        'name': ['A', 'B', 'C'],
        'value': [10.5, 20.5, 30.5]
    })
    
    writer = PostgresWriter()
    writer.connection = mock_conn
    rows_written = writer.write_data('coinbase_accounts', df, user_id='user-123', import_id='import-123')
    
    assert rows_written == 3
    mock_cursor.executemany.assert_called_once()
    mock_conn.commit.assert_called_once()
    
    # Verify table name includes schema
    call_args = mock_cursor.executemany.call_args[0]
    assert 'coinbase.coinbase_accounts' in call_args[0]


@patch('loader.postgres_writer.get_database_config')
@patch('loader.postgres_writer.psycopg2.connect')
def test_write_data_empty_dataframe(mock_connect, mock_get_db_config, mock_db_connection):
    """Test write_data with empty DataFrame."""
    mock_conn, mock_cursor = mock_db_connection
    mock_connect.return_value = mock_conn
    mock_get_db_config.return_value = {
        'host': 'localhost',
        'port': 5432,
        'database': 'test_db',
        'user': 'test_user',
        'password': 'test_password'
    }
    
    df = pd.DataFrame()
    
    writer = PostgresWriter()
    writer.connection = mock_conn
    rows_written = writer.write_data('coinbase_accounts', df)
    
    assert rows_written == 0
    mock_cursor.executemany.assert_not_called()


@patch('loader.postgres_writer.get_database_config')
@patch('loader.postgres_writer.psycopg2.connect')
def test_write_data_adds_user_id(mock_connect, mock_get_db_config, mock_db_connection):
    """Test that write_data adds user_id if not present."""
    mock_conn, mock_cursor = mock_db_connection
    mock_connect.return_value = mock_conn
    mock_get_db_config.return_value = {
        'host': 'localhost',
        'port': 5432,
        'database': 'test_db',
        'user': 'test_user',
        'password': 'test_password'
    }
    
    df = pd.DataFrame({'id': [1], 'name': ['A']})
    
    writer = PostgresWriter()
    writer.connection = mock_conn
    writer.write_data('coinbase_accounts', df, user_id='user-123')
    
    # Verify user_id was added to DataFrame
    call_args = mock_cursor.executemany.call_args[0]
    assert 'user_id' in call_args[0]


@patch('loader.postgres_writer.get_database_config')
@patch('loader.postgres_writer.psycopg2.connect')
def test_write_data_adds_import_id(mock_connect, mock_get_db_config, mock_db_connection):
    """Test that write_data adds import_id if not present."""
    mock_conn, mock_cursor = mock_db_connection
    mock_connect.return_value = mock_conn
    mock_get_db_config.return_value = {
        'host': 'localhost',
        'port': 5432,
        'database': 'test_db',
        'user': 'test_user',
        'password': 'test_password'
    }
    
    df = pd.DataFrame({'id': [1], 'name': ['A']})
    
    writer = PostgresWriter()
    writer.connection = mock_conn
    writer.write_data('coinbase_accounts', df, import_id='import-123')
    
    # Verify import_id was added to DataFrame
    call_args = mock_cursor.executemany.call_args[0]
    assert 'import_id' in call_args[0]


@patch('loader.postgres_writer.get_database_config')
@patch('loader.postgres_writer.psycopg2.connect')
def test_write_data_adds_ingestion_time(mock_connect, mock_get_db_config, mock_db_connection):
    """Test that write_data adds ingestion_time if not present."""
    mock_conn, mock_cursor = mock_db_connection
    mock_connect.return_value = mock_conn
    mock_get_db_config.return_value = {
        'host': 'localhost',
        'port': 5432,
        'database': 'test_db',
        'user': 'test_user',
        'password': 'test_password'
    }
    
    df = pd.DataFrame({'id': [1], 'name': ['A']})
    
    writer = PostgresWriter()
    writer.connection = mock_conn
    writer.write_data('coinbase_accounts', df)
    
    # Verify ingestion_time was added
    call_args = mock_cursor.executemany.call_args[0]
    assert 'ingestion_time' in call_args[0]


@patch('loader.postgres_writer.get_database_config')
@patch('loader.postgres_writer.psycopg2.connect')
def test_write_data_rollback_on_error(mock_connect, mock_get_db_config, mock_db_connection):
    """Test that write_data rolls back on error."""
    mock_conn, mock_cursor = mock_db_connection
    mock_connect.return_value = mock_conn
    mock_get_db_config.return_value = {
        'host': 'localhost',
        'port': 5432,
        'database': 'test_db',
        'user': 'test_user',
        'password': 'test_password'
    }
    
    df = pd.DataFrame({'id': [1], 'name': ['A']})
    mock_cursor.executemany.side_effect = Exception("Database error")
    
    writer = PostgresWriter()
    writer.connection = mock_conn
    
    with pytest.raises(Exception):
        writer.write_data('coinbase_accounts', df)
    
    mock_conn.rollback.assert_called_once()


@patch('loader.postgres_writer.get_database_config')
@patch('loader.postgres_writer.psycopg2.connect')
def test_write_data_non_coinbase_table(mock_connect, mock_get_db_config, mock_db_connection):
    """Test that non-coinbase tables use configured schema."""
    mock_conn, mock_cursor = mock_db_connection
    mock_connect.return_value = mock_conn
    mock_get_db_config.return_value = {
        'host': 'localhost',
        'port': 5432,
        'database': 'test_db',
        'user': 'test_user',
        'password': 'test_password',
        'schema': 'custom_schema'
    }
    
    df = pd.DataFrame({'id': [1], 'name': ['A']})
    
    writer = PostgresWriter()
    writer.connection = mock_conn
    writer.write_data('other_table', df)
    
    # Verify non-coinbase table uses custom schema
    call_args = mock_cursor.executemany.call_args[0]
    assert 'custom_schema.other_table' in call_args[0]


@patch('loader.postgres_writer.get_database_config')
@patch('loader.postgres_writer.psycopg2.connect')
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
    
    writer = PostgresWriter()
    writer.connection = mock_conn
    writer.close_connection()
    
    mock_conn.close.assert_called_once()

