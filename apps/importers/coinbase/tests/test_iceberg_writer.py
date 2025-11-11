import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime
from loader.iceberg_writer import IcebergWriter
from loader.schema_registry import SchemaRegistry
import pandas as pd
import pyarrow as pa


@pytest.fixture
def mock_config_reader():
    config = Mock()
    config.get_nessie_uri.return_value = "test_uri"
    config.get_nessie_warehouse.return_value = "test_warehouse"
    config.get_nessie_warehouse_location.return_value = "test_location"
    config.get_nessie_branch.return_value = "test_branch"
    return config


@pytest.fixture
def mock_catalog():
    catalog = Mock()
    catalog.list_tables.return_value = []
    return catalog


@pytest.fixture
def iceberg_writer(mock_config_reader, mock_catalog):
    with patch('loader.iceberg_writer.load_catalog', return_value=mock_catalog):
        writer = IcebergWriter(mock_config_reader)
        return writer


def test_initialize_tables_new_table(iceberg_writer, mock_catalog):
    table_name = "coinbase_pro"
    schema = SchemaRegistry.get_schema_for_table(table_name)
    
    with patch.object(SchemaRegistry, 'get_schema_for_table', return_value=schema):
        iceberg_writer.initialize_tables(table_name)
        
        mock_catalog.create_namespace_if_not_exists.assert_called_once_with("coinbase")
        mock_catalog.create_table.assert_called_once()


def test_initialize_tables_existing_table(iceberg_writer, mock_catalog):
    table_name = "existing_table"
    mock_catalog.list_tables.return_value = [("coinbase", "existing_table")]
    
    iceberg_writer.initialize_tables(table_name)
    
    mock_catalog.create_namespace_if_not_exists.assert_called_once_with("coinbase")
    mock_catalog.create_table.assert_not_called()


def test_write_data_success(iceberg_writer, mock_catalog):
    table_name = "coinbase_pro"
    test_data = [{"portfolio": "test_portfolio", "type": "deposit", "amount": "100"}]
    mock_table = Mock()
    mock_catalog.load_table.return_value = mock_table

    schema = SchemaRegistry.get_schema_for_table(table_name)
    with patch.object(SchemaRegistry, 'get_schema_for_table', return_value=schema):
        # Provide real DataFrame for PyArrow
        df = pd.DataFrame({
            "ingestion_time": [datetime.now(), datetime.now()],
            "portfolio": ["test_portfolio", "test_portfolio"],
            "type": ["deposit", "withdrawal"],
            "amount": ["100", "200"]
        })

        # Mock the overwrite method
        mock_table.overwrite = Mock()
        
        with patch('pandas.DataFrame', return_value=df):
            iceberg_writer.write_data(table_name, test_data)
            
            mock_catalog.load_table.assert_called_once_with("coinbase.coinbase_pro")


def test_write_data_conversion_error(iceberg_writer, mock_catalog):
    table_name = "coinbase_pro"
    test_data = [{"portfolio": "test_portfolio"}]
    
    with patch('pandas.DataFrame', side_effect=Exception("Conversion error")):
        iceberg_writer.write_data(table_name, test_data)
        
        mock_catalog.load_table.assert_called_once_with("coinbase.coinbase_pro")
        mock_catalog.load_table.return_value.overwrite.assert_not_called()


def test_write_data_write_error(iceberg_writer, mock_catalog):
    table_name = "coinbase_pro"
    test_data = [{"portfolio": "test_portfolio"}]
    mock_table = Mock()
    mock_table.overwrite.side_effect = Exception("Write error")
    mock_catalog.load_table.return_value = mock_table

    df = pd.DataFrame({
        "ingestion_time": [datetime.now()],
        "portfolio": ["test_portfolio"],
        "type": ["deposit"],
        "amount": ["100"]
    })

    with patch('pandas.DataFrame', return_value=df):
        iceberg_writer.write_data(table_name, test_data)
        
        mock_catalog.load_table.assert_called_once_with("coinbase.coinbase_pro")