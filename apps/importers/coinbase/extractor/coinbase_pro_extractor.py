import logging
import pandas as pd
from datetime import datetime

from extractor.csv_sources.local_file_source import LocalFileSource
from shared.utils.env_loader import get_coinbase_pro_accounts_path, get_coinbase_pro_fills_path

logger = logging.getLogger(__name__)

class CoinbaseProExtractor:
    """
    Extractor that works with different file sources to process CSV files.
    """
    VALID_DATA_TYPES = ['accounts', 'fills']

    @classmethod
    def create(cls, data_type: str, folder_path: str = None):
        """
        Factory method to create extractor instance with local file source.
        
        Args:
            data_type: Type of data ('accounts' or 'fills')
            folder_path: Optional folder path. If not provided, loads from environment variables.
        """
        if data_type not in cls.VALID_DATA_TYPES:
            raise ValueError(f"data_type must be one of {cls.VALID_DATA_TYPES}")

        logger.info(f"Creating extractor for local CSV files")
        
        # Get the appropriate folder path
        if folder_path:
            path = folder_path
        else:
            # Fallback to environment variables for backward compatibility
            path = (get_coinbase_pro_accounts_path() 
                   if data_type == 'accounts' 
                   else get_coinbase_pro_fills_path())
        
        if not path:
            raise ValueError(f"Folder path for {data_type} not configured. Please provide folder_path parameter or set COINBASE_PRO_{data_type.upper()}_FOLDER_PATH in your .env file.")
        
        file_source = LocalFileSource(path)
        return cls(file_source=file_source, data_type=data_type)

    def __init__(self, file_source, data_type: str):
        """
        Initialize the extractor with a file source and data type.

        Args:
            file_source: An object that has a `get_files` method returning a list of file paths.
            data_type (str): The type of data to process ('accounts' or 'fills').
        """
        self.file_source = file_source
        self.data_type = data_type  # 'accounts' or 'fills'

    def run(self) -> pd.DataFrame:
        """
        Execute the extraction process.

        Returns:
            pd.DataFrame: A single DataFrame combining all processed CSV files.
        """
        try:
            files = self.file_source.get_files()
            dataframes = []

            for file in files:
                logger.info(f"Processing file: {file}")
                df = self.process_csv(file)
                dataframes.append(df)

            # Concatenate all DataFrames into one
            combined_df = pd.concat(dataframes, ignore_index=True)
            logger.info(f"Extraction process completed successfully. Total records: {len(combined_df)}")
            return combined_df

        except Exception as e:
            logger.error(f"An error occurred during extraction: {e}")
            raise

    def process_csv(self, file_path: str) -> pd.DataFrame:
        """
        Process a single CSV file and return DataFrame with normalized columns.

        Args:
            file_path (str): Path to the CSV file to process.

        Returns:
            pd.DataFrame: DataFrame with processed records.
        """
        try:
            # Read CSV file
            df = pd.read_csv(file_path, dtype=str)
            
            # Normalize column names: lowercase, replace spaces/special chars with underscore
            df.columns = [col.lower().replace(' ', '_').replace('/', '_') for col in df.columns]
            
            # Add ingestion timestamp
            df['ingestion_time'] = datetime.now()
            
            logger.info(f"Processed {len(df)} records from {file_path}")
            return df

        except Exception as e:
            logger.error(f"Error processing file {file_path}: {e}")
            raise

    @staticmethod
    def _process_account_row(row):
        return {
            "portfolio": row.get("portfolio"),
            "type": row.get("type"),
            "time": row.get("time"),
            "amount": row.get("amount"),
            "balance": row.get("balance"),
            "amount_balance_unit": row.get("amount/balance unit"),
            "transfer_id": row.get("transfer id"),
            "trade_id": row.get("trade id"),
            "order_id": row.get("order id")
        }

    @staticmethod
    def _process_fill_row(row):
        return {
            "portfolio": row.get("portfolio"),
            "trade_id": row.get("trade id"),
            "product": row.get("product"),
            "side": row.get("side"),
            "created_at": row.get("created at"),
            "size": row.get("size"),
            "size_unit": row.get("size unit"),
            "price": row.get("price"),
            "fee": row.get("fee"),
            "total": row.get("total"),
            "price_fee_total_unit": row.get("price/fee/total unit")
        }
    
    def cleanup(self):
        """Clean up any resources used by the extractor."""
        self.file_source.cleanup()