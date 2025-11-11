# Importer Scheduler Architecture

## Overview

The scheduler system manages automated imports for various data importers (Coinbase, Binance, etc.). The scheduler runs in the backend and communicates with importer services via gRPC.

## Architecture

```
┌─────────────────┐
│   UI/Frontend   │
└────────┬────────┘
         │ REST API
         ▼
┌─────────────────┐
│   Backend API    │
│  (Express/TS)    │
│                  │
│  ┌────────────┐  │
│  │ Scheduler  │  │
│  │  Service   │  │
│  └─────┬──────┘  │
│        │         │
│  ┌─────▼──────┐  │
│  │ gRPC Client│  │
│  └─────┬──────┘  │
└────────┼─────────┘
         │ gRPC
         ▼
┌─────────────────┐
│  Coinbase       │
│  Importer       │
│  (Python)       │
└─────────────────┘
```

## Components

### 1. Backend Scheduler Service (`ImporterSchedulerService`)

- Manages scheduled import jobs using `node-schedule` (Node.js equivalent of APScheduler)
- Stores job configurations in PostgreSQL
- Communicates with importers via gRPC
- Automatically loads and schedules jobs on startup

**Note:** We use `node-schedule` instead of APScheduler because:
- APScheduler is Python-only
- The backend is TypeScript/Node.js
- `node-schedule` provides similar functionality (cron-based scheduling, job management)

**Key Features:**
- Cron-based scheduling
- Persistent job storage in database
- Automatic job execution
- Job status tracking

### 2. gRPC Client Service (`GrpcClientService`)

- Generic gRPC client for communicating with importers
- Supports standard importer service interface:
  - `StartImport(source)` - Start an import for a source
  - `StopImport(source)` - Stop a running import
  - `GetStatus()` - Get current importer status
  - `GetConfig()` - Get importer configuration
  - `SetConfig(config)` - Update importer configuration

### 3. Importer Service (Python)

Each importer (Coinbase, Binance, etc.) implements a simplified gRPC service:

- **No built-in scheduler** - Imports are triggered externally
- **Simplified interface** - Only Start/Stop, Status, and Config operations
- **Generic proto** - Shared proto definition for all importers

## Database Schema

### `scheduler.import_jobs`

Stores scheduled import jobs:

```sql
CREATE TABLE scheduler.import_jobs (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users.users(id),
    importer_name VARCHAR(50) NOT NULL,  -- e.g., 'coinbase'
    source VARCHAR(50) NOT NULL,  -- e.g., 'app', 'pro', 'all'
    enabled BOOLEAN DEFAULT true,
    cron_expression VARCHAR(100) NOT NULL,
    description TEXT,
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,
    last_run_status VARCHAR(20),  -- 'success', 'failed', 'running'
    last_run_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, importer_name, source)
);
```

## API Endpoints

### Scheduler Management

- `GET /api/v1/scheduler/jobs` - Get all scheduled jobs for user
- `GET /api/v1/scheduler/jobs/:id` - Get specific job
- `POST /api/v1/scheduler/jobs` - Create new scheduled job
- `PUT /api/v1/scheduler/jobs/:id` - Update scheduled job
- `DELETE /api/v1/scheduler/jobs/:id` - Delete scheduled job

### Importer Management

- `GET /api/v1/scheduler/importers/:name/status` - Get importer status
- `GET /api/v1/scheduler/importers/:name/config` - Get importer config
- `PUT /api/v1/scheduler/importers/:name/config` - Update importer config

## Cron Expression Format

The scheduler uses the standard cron format:
```
second minute hour day month dayOfWeek
```

Examples:
- `0 * * * *` - Every hour at minute 0
- `0 */2 * * *` - Every 2 hours
- `0 9 * * *` - Every day at 9:00 AM
- `0 0 * * 0` - Every Sunday at midnight

## Environment Variables

### Backend

```bash
# Coinbase Importer
COINBASE_IMPORTER_HOST=localhost
COINBASE_IMPORTER_PORT=50051

# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=arqos
POSTGRES_USER=arqos_user
POSTGRES_PASSWORD=arqos_password

# JWT
JWT_SECRET=your-secret-key
```

### Importer

```bash
# gRPC Server
GRPC_PORT=50051

# Database (same as backend)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=arqos
POSTGRES_USER=arqos_user
POSTGRES_PASSWORD=arqos_password
POSTGRES_SCHEMA=coinbase
```

## Usage Examples

### Creating a Scheduled Job

```bash
curl -X POST http://localhost:3000/api/v1/scheduler/jobs \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "importer_name": "coinbase",
    "source": "app",
    "cron_expression": "0 * * * *",
    "description": "Import Coinbase App data every hour"
  }'
```

### Getting Importer Status

```bash
curl -X GET http://localhost:3000/api/v1/scheduler/importers/coinbase/status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Updating Importer Config

```bash
curl -X PUT http://localhost:3000/api/v1/scheduler/importers/coinbase/config \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "database": {
      "host": "localhost",
      "port": 5432,
      "database": "arqos",
      "schema": "coinbase",
      "user": "arqos_user",
      "password": "arqos_password"
    },
    "settings": {
      "use_cache": "true",
      "cache_directory": ".cache"
    }
  }'
```

## Migration from Old Architecture

### Changes to Coinbase Importer

1. **Removed Scheduler** - No more internal scheduler
2. **Simplified gRPC Interface** - Only Start/Stop, Status, Config operations
3. **No Auto-Start** - Imports never start automatically
4. **Generic Callbacks** - Simplified callback structure

### Benefits

- **Separation of Concerns** - Scheduling logic is centralized in backend
- **Scalability** - Can easily add new importers
- **Consistency** - All importers use the same interface
- **Flexibility** - Can schedule multiple importers from one place

## Testing

Run unit tests:

```bash
cd apps/backend
npm test
```

## Future Improvements

- Support for interval-based scheduling (in addition to cron)
- Job retry logic with exponential backoff
- Job execution history and logging
- Webhook notifications for job completion
- Job dependencies (run job B after job A completes)
- Distributed scheduling for multiple backend instances

