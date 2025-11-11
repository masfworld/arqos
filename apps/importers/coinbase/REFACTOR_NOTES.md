# Coinbase Importer Refactoring Notes

## Overview

The Coinbase importer has been refactored to simplify the architecture and remove the internal scheduler. The scheduler is now managed by the backend service.

## Key Changes

### 1. Removed Internal Scheduler

- **Deleted**: `grpc_service/scheduler.py`
- **Removed**: All scheduler-related imports and code from `main.py`
- **Removed**: `EnhancedImporterScheduler` and `DataCollectionCallback` classes

### 2. Simplified gRPC Interface

The gRPC service now only supports:

- `StartImport(source)` - Start import for "app", "pro", or "all"
- `StopImport(source)` - Stop running import
- `GetStatus()` - Get current status of all sources
- `GetConfig()` - Get current configuration
- `SetConfig(config)` - Update configuration

**Removed Methods:**
- `ControlImporter()` - Replaced by `StartImport`/`StopImport`
- `TriggerImportNow()` - Replaced by `StartImport`
- Old configuration methods - Simplified to `GetConfig`/`SetConfig`

### 3. Updated Proto File

The `proto/importer_config.proto` file has been updated to match the new simplified interface:

- Service renamed from `ImporterConfigService` to `ImporterService`
- Simplified message types
- Removed scheduler-specific fields
- Added support for per-source status tracking

### 4. Simplified Main Entry Point

**Before:**
```python
# Complex callback setup
callbacks = {...}
data_callbacks = DataCollectionCallback(...)
scheduler = EnhancedImporterScheduler(...)
scheduler.start()
```

**After:**
```python
# Simple callback setup
callbacks = {
    "app": coinbase_app_callback,
    "pro": coinbase_pro_callback
}
grpc_server = create_grpc_server(port, callbacks=callbacks)
grpc_server.start()
```

### 5. No Auto-Start

Imports will **never** start automatically when the application starts. All imports must be triggered via gRPC from external clients (typically the backend scheduler).

## Configuration

Configuration is now handled via gRPC `SetConfig` method. The configuration includes:

- Database connection settings
- Importer-specific settings (use_cache, cache_directory, etc.)

## Status Tracking

Status is tracked per source (app/pro) and includes:

- `is_running` - Whether import is currently running
- `last_run_time` - ISO timestamp of last run
- `last_error` - Error message from last run (if any)
- `total_runs` - Total number of runs
- `successful_runs` - Number of successful runs
- `failed_runs` - Number of failed runs

## Running the Importer

### Start the Service

```bash
cd apps/importers/coinbase
python main.py
```

The service will:
1. Load configuration from environment variables
2. Start the gRPC server on port 50051 (default)
3. Wait for gRPC requests from clients

### Trigger an Import

Use the backend API or directly via gRPC client:

```python
from grpc_generated import importer_config_pb2
from grpc_generated import importer_config_pb2_grpc
import grpc

channel = grpc.insecure_channel('localhost:50051')
stub = importer_config_pb2_grpc.ImporterServiceStub(channel)

# Start import
request = importer_config_pb2.StartImportRequest(source="app")
response = stub.StartImport(request)
print(response.message)
```

## Testing

Run the importer tests:

```bash
cd apps/importers/coinbase
python -m pytest tests/
```

## Migration Checklist

- [x] Remove scheduler.py
- [x] Simplify main.py
- [x] Update proto file
- [x] Refactor gRPC service
- [x] Update callbacks to use "app"/"pro" instead of "coinbase_app"/"coinbase_pro"
- [x] Remove auto-start logic
- [x] Update documentation

## Backward Compatibility

**Breaking Changes:**
- Old gRPC client code will not work - proto definitions changed
- Scheduler functionality moved to backend
- No more auto-start imports

**Migration Path:**
1. Update any gRPC clients to use new proto definitions
2. Use backend scheduler API instead of importer scheduler
3. Remove any auto-start configuration

## Future Improvements

- Support for streaming imports (for large datasets)
- Import progress tracking
- Parallel source imports
- Import history and audit logs

