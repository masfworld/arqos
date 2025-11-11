import pytest
from unittest.mock import MagicMock, patch, mock_open
import pandas as pd
from extractor.coinbase_pro_extractor import CoinbaseProExtractor

@pytest.fixture
def mock_local_file_source():
    """Fixture to mock a local file source."""
    mock_file_source = MagicMock()
    mock_file_source.get_files.return_value = ["/path/to/file1.csv", "/path/to/file2.csv"]
    return mock_file_source

@patch("pandas.read_csv")
def test_process_csv_accounts(mock_read_csv, mock_local_file_source):
    """Test processing CSV for 'accounts' data type."""
    # Mock the content of the CSV file
    mock_read_csv.return_value = pd.DataFrame({
        "portfolio": ["portfolio1"],
        "type": ["type1"],
        "time": ["time1"],
        "amount": ["amount1"],
        "balance": ["balance1"],
        "amount/balance unit": ["unit1"],
        "transfer id": ["transfer1"],
        "trade id": ["trade1"],
        "order id": ["order1"],
    })

    extractor = CoinbaseProExtractor(file_source=mock_local_file_source, data_type='accounts')
    records = extractor.process_csv("/path/to/file.csv")

    # Assertions
    assert len(records) == 1
    assert "ingestion_time" in records.columns
    assert records.iloc[0]["portfolio"] == "portfolio1"
    assert records.iloc[0]["amount_balance_unit"] == "unit1"

@patch("pandas.read_csv")
def test_process_csv_fills(mock_read_csv, mock_local_file_source):
    """Test processing CSV for 'fills' data type."""
    # Mock the content of the CSV file
    mock_read_csv.return_value = pd.DataFrame({
        "portfolio": ["portfolio1"],
        "trade id": ["trade1"],
        "product": ["product1"],
        "side": ["side1"],
        "created at": ["created1"],
        "size": ["size1"],
        "size unit": ["unit1"],
        "price": ["price1"],
        "fee": ["fee1"],
        "total": ["total1"],
        "price/fee/total unit": ["unit2"]
    })

    extractor = CoinbaseProExtractor(file_source=mock_local_file_source, data_type='fills')
    records = extractor.process_csv("/path/to/file.csv")

    # Assertions
    assert len(records) == 1
    assert "ingestion_time" in records.columns
    assert records.iloc[0]["trade_id"] == "trade1"
    assert records.iloc[0]["price_fee_total_unit"] == "unit2"

@patch("extractor.coinbase_pro_extractor.pd.read_csv")
def test_run(mock_read_csv, mock_local_file_source):
    """Test the full run method for CoinbaseProExtractor."""
    # Mock the CSV reading
    mock_read_csv.side_effect = [
        pd.DataFrame({
            "portfolio": ["portfolio1"],
            "type": ["type1"],
            "time": ["time1"],
            "amount": ["amount1"],
            "balance": ["balance1"],
            "amount/balance unit": ["unit1"],
            "transfer id": ["transfer1"],
            "trade id": ["trade1"],
            "order id": ["order1"]
        }),
        pd.DataFrame({
            "portfolio": ["portfolio2"],
            "type": ["type2"],
            "time": ["time2"],
            "amount": ["amount2"],
            "balance": ["balance2"],
            "amount/balance unit": ["unit2"],
            "transfer id": ["transfer2"],
            "trade id": ["trade2"],
            "order id": ["order2"]
        })
    ]

    # Initialize the extractor
    extractor = CoinbaseProExtractor(file_source=mock_local_file_source, data_type='accounts')

    # Run the extractor
    df = extractor.run()

    # Assertions
    assert isinstance(df, pd.DataFrame)  # Check if the result is a DataFrame
    assert len(df) == 2  # Two rows from two files
    assert set(df.columns) == {
        "portfolio", "type", "time", "amount", "balance",
        "amount_balance_unit", "transfer_id", "trade_id", "order_id", "ingestion_time"
    }  # Ensure all columns are present and normalized
    assert df.iloc[0]["portfolio"] == "portfolio1"
    assert df.iloc[1]["portfolio"] == "portfolio2"