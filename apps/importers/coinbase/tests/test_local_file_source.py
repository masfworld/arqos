import unittest
from unittest.mock import patch
import os
from extractor.csv_sources.local_file_source import LocalFileSource

class TestLocalFileSource(unittest.TestCase):
    @patch("os.listdir")
    def test_get_files(self, mock_listdir):
        # Mock the os.listdir response
        mock_listdir.return_value = ["file1.csv", "file2.csv", "file3.txt"]
        folder_path = "/test/folder"
        source = LocalFileSource(folder_path)

        # Test get_files
        files = source.get_files()

        # Assertions
        mock_listdir.assert_called_with(folder_path)
        self.assertEqual(files, [os.path.join(folder_path, "file1.csv"), os.path.join(folder_path, "file2.csv")])
