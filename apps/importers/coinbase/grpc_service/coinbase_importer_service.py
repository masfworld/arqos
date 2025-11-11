"""
Coinbase Importer gRPC Service
gRPC service implementation for Coinbase importer control.
"""

import logging
from datetime import datetime
from grpc_generated import importer_config_pb2
from grpc_generated import importer_config_pb2_grpc

from grpc_service.coinbase_importer_config import CoinbaseImporterConfig, SourceStatus
from grpc_service.grpc_manager import GRPCManager

logger = logging.getLogger(__name__)


class CoinbaseImporterService(importer_config_pb2_grpc.ImporterServiceServicer):
    """gRPC service implementation for Coinbase importer control."""
    
    def __init__(self, manager: GRPCManager):
        """
        Initialize CoinbaseImporterService.
        
        Args:
            manager: GRPCManager instance
        """
        self.manager = manager
        
    def StartImport(self, request, context):
        """Start an import for a specific source."""
        try:
            source = request.source.lower()
            user_id = request.user_id if request.user_id else None
            success, message = self.manager.start_import(source, user_id=user_id)
            
            return importer_config_pb2.ImportResponse(
                success=success,
                message=message
            )
        except Exception as e:
            logger.error(f"Error starting import: {e}")
            return importer_config_pb2.ImportResponse(
                success=False,
                message=f"Error starting import: {str(e)}"
            )
    
    def StopImport(self, request, context):
        """Stop an import for a specific source."""
        try:
            source = request.source.lower()
            success, message = self.manager.stop_import(source)
            
            return importer_config_pb2.ImportResponse(
                success=success,
                message=message
            )
        except Exception as e:
            logger.error(f"Error stopping import: {e}")
            return importer_config_pb2.ImportResponse(
                success=False,
                message=f"Error stopping import: {str(e)}"
            )
    
    def GetStatus(self, request, context):
        """Get current importer status for a specific user."""
        try:
            if not request.user_id:
                return importer_config_pb2.GetStatusResponse(
                    success=False,
                    message="user_id is required"
                )
            
            status = self.manager.get_status(request.user_id)
            status_proto = self._status_to_proto(status)
            
            return importer_config_pb2.GetStatusResponse(
                status=status_proto,
                success=True,
                message="Status retrieved successfully"
            )
        except Exception as e:
            logger.error(f"Error getting status: {e}")
            return importer_config_pb2.GetStatusResponse(
                success=False,
                message=f"Error getting status: {str(e)}"
            )
    
    def GetConfig(self, request, context):
        """Get current configuration for a specific user."""
        try:
            if not request.user_id:
                return importer_config_pb2.GetConfigResponse(
                    success=False,
                    message="user_id is required"
                )
            
            config = self.manager.get_config(request.user_id)
            if not config:
                return importer_config_pb2.GetConfigResponse(
                    success=False,
                    message=f"No Coinbase configuration found for user_id: {request.user_id}"
                )
            
            config_proto = self._config_to_proto(config, mask_secret=True)
            
            return importer_config_pb2.GetConfigResponse(
                config=config_proto,
                success=True,
                message="Configuration retrieved successfully"
            )
        except Exception as e:
            logger.error(f"Error getting config: {e}")
            return importer_config_pb2.GetConfigResponse(
                success=False,
                message=f"Error getting config: {str(e)}"
            )
    
    def SetConfig(self, request, context):
        """Update configuration (partial updates supported - only non-empty fields are updated)."""
        try:
            if not request.user_id:
                return importer_config_pb2.SetConfigResponse(
                    success=False,
                    message="user_id is required"
                )
            
            # Get current config from database
            current_config = self.manager.get_config(request.user_id)
            
            # Convert proto to config, merging with current config for partial updates
            updated_config = self._proto_to_config(request.config, current_config)
            
            # Save to database
            self.manager.set_config(request.user_id, updated_config)
            
            return importer_config_pb2.SetConfigResponse(
                success=True,
                message="Configuration updated successfully"
            )
        except Exception as e:
            logger.error(f"Error updating config: {e}")
            return importer_config_pb2.SetConfigResponse(
                success=False,
                message=f"Error updating config: {str(e)}"
            )
    
    def _config_to_proto(self, config: CoinbaseImporterConfig, mask_secret: bool = False):
        """Convert CoinbaseImporterConfig to protobuf message."""
        api_secret = "********" if mask_secret and config.coinbase_api_secret else config.coinbase_api_secret
        
        return importer_config_pb2.ImporterConfig(
            coinbase_api_key=config.coinbase_api_key,
            coinbase_api_secret=api_secret,
            coinbase_pro_accounts_folder_path=config.coinbase_pro_accounts_folder_path,
            coinbase_pro_fills_folder_path=config.coinbase_pro_fills_folder_path,
            settings=config.settings
        )
    
    def _proto_to_config(self, config_proto, current_config: CoinbaseImporterConfig = None):
        """
        Convert protobuf message to CoinbaseImporterConfig.
        
        Supports partial updates: only non-empty fields from proto are used.
        If current_config is provided, missing fields are taken from it.
        """
        # If current_config is provided, start with it for partial updates
        if current_config:
            api_key = config_proto.coinbase_api_key if config_proto.coinbase_api_key else current_config.coinbase_api_key
            # Only update secret if provided and not masked (not "********")
            api_secret = config_proto.coinbase_api_secret if (config_proto.coinbase_api_secret and config_proto.coinbase_api_secret != "********") else current_config.coinbase_api_secret
            accounts_path = config_proto.coinbase_pro_accounts_folder_path if config_proto.coinbase_pro_accounts_folder_path else current_config.coinbase_pro_accounts_folder_path
            fills_path = config_proto.coinbase_pro_fills_folder_path if config_proto.coinbase_pro_fills_folder_path else current_config.coinbase_pro_fills_folder_path
            # Merge settings: proto settings override current settings
            settings = dict(current_config.settings) if current_config.settings else {}
            if config_proto.settings:
                settings.update(dict(config_proto.settings))
        else:
            # Full update - use proto values directly
            api_key = config_proto.coinbase_api_key
            api_secret = config_proto.coinbase_api_secret if config_proto.coinbase_api_secret != "********" else ""
            accounts_path = config_proto.coinbase_pro_accounts_folder_path
            fills_path = config_proto.coinbase_pro_fills_folder_path
            settings = dict(config_proto.settings) if config_proto.settings else {}
        
        return CoinbaseImporterConfig(
            coinbase_api_key=api_key,
            coinbase_api_secret=api_secret,
            coinbase_pro_accounts_folder_path=accounts_path,
            coinbase_pro_fills_folder_path=fills_path,
            settings=settings
        )
    
    def _status_to_proto(self, status_dict):
        """Convert status dictionary to protobuf message."""
        sources_proto = {}
        for source_name, source_status in status_dict.items():
            sources_proto[source_name] = importer_config_pb2.SourceStatus(
                is_running=source_status.is_running,
                last_run_time=source_status.last_run_time,
                last_error=source_status.last_error,
                total_runs=source_status.total_runs,
                successful_runs=source_status.successful_runs,
                failed_runs=source_status.failed_runs
            )
        
        overall_running = any(s.is_running for s in status_dict.values())
        
        return importer_config_pb2.ImporterStatus(
            sources=sources_proto,
            is_running=overall_running,
            last_updated=datetime.now().isoformat()
        )

