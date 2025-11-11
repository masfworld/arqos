import os

class LocalFileSource:
    """
    File source for local filesystem.
    """
    def __init__(self, folder_path: str):
        self.folder_path = folder_path

    def get_files(self):
        """
        Retrieve all CSV file paths from the local folder.

        Returns:
            List[str]: A list of file paths for all CSV files in the folder.
        """
        try:
            return [os.path.join(self.folder_path, f) for f in os.listdir(self.folder_path) if f.endswith('.csv')]
        except FileNotFoundError as e:
            raise RuntimeError(f"Error accessing local folder: {e}")
        
    def cleanup(self):
        """No cleanup needed for local file source."""
        pass