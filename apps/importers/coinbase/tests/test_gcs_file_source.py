import unittest
from unittest.mock import MagicMock, patch
from extractor.csv_sources.gcs_file_source import GCSFileSource
import os


class TestGCSFileSource(unittest.TestCase):
    @patch("extractor.csv_sources.gcs_file_source.storage.Client")
    def test_get_files(self, mock_storage_client):
        # Mock the GCS bucket and blobs
        mock_client = MagicMock()
        mock_bucket = MagicMock()
        mock_blob_1 = MagicMock()
        mock_blob_2 = MagicMock()

        # Set up mock blob names
        mock_blob_1.name = "folder/subfolder/file1.csv"
        mock_blob_2.name = "folder/subfolder/file2.csv"
        mock_bucket.list_blobs.return_value = [mock_blob_1, mock_blob_2]

        # Mock client to return the mocked bucket
        mock_client.get_bucket.return_value = mock_bucket
        mock_storage_client.return_value = mock_client

        # Initialize GCSFileSource
        gcs_path = "gs://test-bucket/folder/subfolder"
        gcs_source = GCSFileSource(gcs_path)

        # Mock the download_to_filename method to avoid actual file writing
        mock_blob_1.download_to_filename = MagicMock()
        mock_blob_2.download_to_filename = MagicMock()

        # Get files
        files = gcs_source.get_files()

        # Assertions
        self.assertEqual(len(files), 2)
        self.assertTrue(files[0].endswith("file1.csv"))
        self.assertTrue(files[1].endswith("file2.csv"))
        mock_client.get_bucket.assert_called_once_with("test-bucket")
        mock_bucket.list_blobs.assert_called_once_with(prefix="folder/subfolder")
        mock_blob_1.download_to_filename.assert_called_once()
        mock_blob_2.download_to_filename.assert_called_once()

        # Cleanup temporary directory
        gcs_source.cleanup()
        self.assertFalse(os.path.exists(gcs_source.temp_dir))

    def test_invalid_gcs_path(self):
        # Test invalid GCS path
        with self.assertRaises(ValueError):
            GCSFileSource("invalid-path")
