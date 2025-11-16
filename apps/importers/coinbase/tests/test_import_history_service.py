"""
Unit tests for ImportHistoryService
"""

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone
from helpers.import_history_service import ImportHistoryService


@pytest.fixture
def mock_db_connection():
    """Create a mock database connection."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value = mock_cursor
    mock_conn.closed = False
    return mock_conn, mock_cursor


@patch('helpers.import_history_service.get_database_config')
@patch('helpers.import_history_service.psycopg2.connect')
def test_log_import_start_success(mock_connect, mock_get_db_config, mock_db_connection):
    """Test successful import start logging."""
    mock_conn, mock_cursor = mock_db_connection
    mock_connect.return_value = mock_conn
    mock_get_db_config.return_value = {
        'host': 'localhost',
        'port': 5432,
        'database': 'test_db',
        'user': 'test_user',
        'password': 'test_password'
    }
    
    # Mock fetchone to return import_id
    mock_cursor.fetchone.return_value = ('import-123',)
    
    service = ImportHistoryService()
    service.connection = mock_conn
    import_id = service.log_import_start('user-123', 'coinbase', 'app')
    
    assert import_id == 'import-123'
    mock_cursor.execute.assert_called_once()
    mock_conn.commit.assert_called_once()
    
    # Verify query parameters
    call_args = mock_cursor.execute.call_args[0]
    assert 'INSERT INTO analytics.import_history' in call_args[0]
    # Query parameters: (user_id, importer_name, source, start_time)
    # Status 'running' is hardcoded in SQL, not a parameter
    params = call_args[1]
    assert params[0] == 'user-123'  # user_id
    assert params[1] == 'coinbase'  # importer_name
    assert params[2] == 'app'  # source
    # params[3] is start_time (datetime), not status
    assert 'running' in call_args[0]  # Status is in SQL query string


@patch('helpers.import_history_service.get_database_config')
@patch('helpers.import_history_service.psycopg2.connect')
def test_log_import_completion_success(mock_connect, mock_get_db_config, mock_db_connection):
    """Test successful import completion logging."""
    mock_conn, mock_cursor = mock_db_connection
    mock_connect.return_value = mock_conn
    mock_get_db_config.return_value = {
        'host': 'localhost',
        'port': 5432,
        'database': 'test_db',
        'user': 'test_user',
        'password': 'test_password'
    }
    
    # Mock start_time query
    start_time = datetime.now(timezone.utc)
    mock_cursor.fetchone.return_value = (start_time,)
    
    service = ImportHistoryService()
    service.connection = mock_conn
    service.log_import_completion(
        import_id='import-123',
        status='success',
        rows_imported=100,
        metadata={'key': 'value'}
    )
    
    # Should execute two queries: one to get start_time, one to update
    assert mock_cursor.execute.call_count == 2
    mock_conn.commit.assert_called_once()
    
    # Verify update query
    update_call = mock_cursor.execute.call_args_list[1]
    assert 'UPDATE analytics.import_history' in update_call[0][0]
    assert update_call[0][1][0] == 'success'  # status
    assert update_call[0][1][3] == 100  # rows_imported


@patch('helpers.import_history_service.get_database_config')
@patch('helpers.import_history_service.psycopg2.connect')
def test_log_import_completion_failed(mock_connect, mock_get_db_config, mock_db_connection):
    """Test import completion logging with failure."""
    mock_conn, mock_cursor = mock_db_connection
    mock_connect.return_value = mock_conn
    mock_get_db_config.return_value = {
        'host': 'localhost',
        'port': 5432,
        'database': 'test_db',
        'user': 'test_user',
        'password': 'test_password'
    }
    
    start_time = datetime.now(timezone.utc)
    mock_cursor.fetchone.return_value = (start_time,)
    
    service = ImportHistoryService()
    service.connection = mock_conn
    service.log_import_completion(
        import_id='import-123',
        status='failed',
        rows_imported=0,
        error_message='Test error',
        metadata={}
    )
    
    # Verify error message is included
    update_call = mock_cursor.execute.call_args_list[1]
    assert update_call[0][1][4] == 'Test error'  # error_message


@patch('helpers.import_history_service.get_database_config')
@patch('helpers.import_history_service.psycopg2.connect')
def test_log_import_completion_not_found(mock_connect, mock_get_db_config, mock_db_connection):
    """Test import completion when import record not found."""
    mock_conn, mock_cursor = mock_db_connection
    mock_connect.return_value = mock_conn
    mock_get_db_config.return_value = {
        'host': 'localhost',
        'port': 5432,
        'database': 'test_db',
        'user': 'test_user',
        'password': 'test_password'
    }
    
    # Mock fetchone to return None (not found)
    mock_cursor.fetchone.return_value = None
    
    service = ImportHistoryService()
    service.connection = mock_conn
    service.log_import_completion('import-123', 'success')
    
    # Should not execute update query if not found
    assert mock_cursor.execute.call_count == 1  # Only the SELECT query


@patch('helpers.import_history_service.get_database_config')
@patch('helpers.import_history_service.psycopg2.connect')
def test_log_import_completion_rollback_on_error(mock_connect, mock_get_db_config, mock_db_connection):
    """Test that log_import_completion rolls back on error."""
    mock_conn, mock_cursor = mock_db_connection
    mock_connect.return_value = mock_conn
    mock_get_db_config.return_value = {
        'host': 'localhost',
        'port': 5432,
        'database': 'test_db',
        'user': 'test_user',
        'password': 'test_password'
    }
    
    start_time = datetime.now(timezone.utc)
    mock_cursor.fetchone.return_value = (start_time,)
    mock_cursor.execute.side_effect = [None, Exception("Database error")]
    
    service = ImportHistoryService()
    service.connection = mock_conn
    
    with pytest.raises(Exception):
        service.log_import_completion('import-123', 'success')
    
    mock_conn.rollback.assert_called_once()


@patch('helpers.import_history_service.get_database_config')
@patch('helpers.import_history_service.psycopg2.connect')
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
    
    service = ImportHistoryService()
    service.connection = mock_conn
    service.close_connection()
    
    mock_conn.close.assert_called_once()

