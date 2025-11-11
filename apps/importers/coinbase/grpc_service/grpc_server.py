"""
Coinbase Importer gRPC Server
gRPC server setup and management for Coinbase importer.
"""

import logging
import grpc
from concurrent import futures
from typing import Dict, Callable
from grpc_reflection.v1alpha import reflection

from grpc_generated import importer_config_pb2_grpc
from grpc_service.coinbase_importer_service import CoinbaseImporterService
from grpc_service.grpc_manager import GRPCManager

logger = logging.getLogger(__name__)


class GRPCServer:
    """gRPC server for Coinbase importer control."""
    
    def __init__(self, manager: GRPCManager, port: int = 50051):
        """
        Initialize GRPCServer.
        
        Args:
            manager: GRPCManager instance
            port: Port for the gRPC server (default: 50051)
        """
        self.manager = manager
        self.port = port
        self.server = None
        self._running = False
    
    def start(self):
        """Start the gRPC server."""
        if importer_config_pb2_grpc is None:
            raise ImportError("gRPC generated code not found. Run 'python generate_grpc.py' first.")
        
        self.server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
        
        # Add the service
        service = CoinbaseImporterService(self.manager)
        importer_config_pb2_grpc.add_ImporterServiceServicer_to_server(service, self.server)
        
        # Enable reflection if available
        if reflection:
            SERVICE_NAME = 'coinbase_importer.ImporterService'
            reflection.enable_server_reflection([SERVICE_NAME], self.server)
            logger.info("gRPC reflection enabled")
        
        # Start server
        listen_addr = f'[::]:{self.port}'
        self.server.add_insecure_port(listen_addr)
        self.server.start()
        
        self._running = True
        logger.info(f"gRPC server started on port {self.port}")
    
    def stop(self):
        """Stop the gRPC server."""
        if self.server and self._running:
            self.server.stop(grace=5)
            self._running = False
            logger.info("gRPC server stopped")
    
    def wait_for_termination(self):
        """Wait for server termination."""
        if self.server:
            self.server.wait_for_termination()


def create_grpc_server(port: int = 50051, callbacks: Dict[str, Callable] = None) -> tuple[GRPCServer]:
    """
    Create and configure gRPC server and manager.
    
    Args:
        port: Port for the gRPC server
        callbacks: Dictionary with callbacks for imports, e.g.:
            {"app": coinbase_app_callback, "pro": coinbase_pro_callback}
    
    Returns:
        GRPCServer instance
    """
    manager = GRPCManager(callbacks=callbacks)
    server = GRPCServer(manager, port)
    return server

