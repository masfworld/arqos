# Running Backend Locally

## Prerequisites

1. **Node.js** (v18 or higher)
   ```bash
   node --version  # Should be v18+
   ```

2. **PostgreSQL** (via Docker or local installation)
   - Option A: Use Docker (recommended)
   - Option B: Install PostgreSQL locally

3. **Coinbase Importer** (optional, only needed for import functionality)
   - Should be running on port 50051

## Environment Configuration Structure

The backend uses a **two-file environment configuration** system:

1. **Shared Configuration** (`apps/shared/.env`) - Contains PostgreSQL and shared settings
2. **Backend Configuration** (`apps/backend/.env`) - Contains only backend-specific settings

The backend loads `shared/.env` first, then overrides with `backend/.env` values.

## Step-by-Step Setup

### 1. Start PostgreSQL Database

**Option A: Using Docker (Recommended)**

```bash
# From project root
docker compose up -d postgres

# Verify it's running
docker ps | grep postgres
```

**Option B: Local PostgreSQL**

Make sure PostgreSQL is running locally on port 5432 (or update the port in `shared/.env`)

### 2. Create Shared Environment File

Create `apps/shared/.env` with PostgreSQL configuration:

```bash
cd apps/shared
cat > .env << 'EOF'
# Database Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5433          # Use 5433 if using Docker (mapped port), 5432 if local
POSTGRES_DATABASE=arqos
POSTGRES_USER=arqos_user
POSTGRES_PASSWORD=arqos_password
POSTGRES_SCHEMA=public

# Redis Configuration (optional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Shared API Configuration
API_PORT=3000
API_HOST=localhost
EOF
```

### 3. Navigate to Backend Directory

```bash
cd apps/backend
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Create Backend-Specific Environment File

Create `apps/backend/.env` with **only backend-specific** configuration:

```bash
cat > .env << 'EOF'
# Backend-Specific Configuration
# PostgreSQL config comes from apps/shared/.env

# API Configuration
API_PORT=3000
NODE_ENV=development

# JWT Secret (change this in production!)
JWT_SECRET=your-secret-key-change-in-production

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000

# Coinbase Importer gRPC (optional - only if importer is running)
COINBASE_IMPORTER_HOST=localhost
COINBASE_IMPORTER_PORT=50051
EOF
```

**Important**: The backend `.env` should **NOT** contain PostgreSQL configuration. That comes from `apps/shared/.env`.

### 6. Verify Database Connection

Make sure the database is initialized with the schema:

```bash
# If using Docker, the schema is auto-initialized
# If using local PostgreSQL, run:
psql -h localhost -U arqos_user -d arqos -f ../../shared/database/init.sql
```

### 7. Run the Backend

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
# Build first
npm run build

# Then run
npm start
```

You should see:
```
Database connection established
🚀 Arqos API Server running on port 3000
📚 API Documentation: http://localhost:3000/api/v1/docs
🏥 Health Check: http://localhost:3000/health
```

### 8. Test the Backend

**Health check:**
```bash
curl http://localhost:3000/health
```

**API docs:**
```bash
curl http://localhost:3000/api/v1/docs
```

## Quick Start Script

Save this as `start-backend.sh` in the project root:

```bash
#!/bin/bash

set -e

echo "🚀 Starting Arqos Backend..."

# Check if PostgreSQL is running
if ! docker ps | grep -q arqos-postgres; then
    echo "📦 Starting PostgreSQL..."
    docker compose up -d postgres
    echo "⏳ Waiting for PostgreSQL to be ready..."
    sleep 5
fi

# Create shared .env if it doesn't exist
if [ ! -f "apps/shared/.env" ]; then
    echo "⚙️  Creating shared .env file..."
    cat > apps/shared/.env << 'EOF'
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_DATABASE=arqos
POSTGRES_USER=arqos_user
POSTGRES_PASSWORD=arqos_password
POSTGRES_SCHEMA=public
REDIS_HOST=localhost
REDIS_PORT=6379
API_PORT=3000
API_HOST=localhost
EOF
    echo "✅ Created apps/shared/.env file."
fi

# Navigate to backend
cd apps/backend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📥 Installing dependencies..."
    npm install
fi

# Check if backend .env exists
if [ ! -f ".env" ]; then
    echo "⚙️  Creating backend .env file..."
    cat > .env << 'EOF'
API_PORT=3000
NODE_ENV=development
JWT_SECRET=your-secret-key-change-in-production
FRONTEND_URL=http://localhost:3000
COINBASE_IMPORTER_HOST=localhost
COINBASE_IMPORTER_PORT=50051
EOF
    echo "✅ Created apps/backend/.env file."
fi

# Start backend
echo "🎯 Starting backend server..."
npm run dev
```

Make it executable and run:
```bash
chmod +x start-backend.sh
./start-backend.sh
```

## Environment Files Structure

```
arqos/
├── apps/
│   ├── shared/
│   │   └── .env          # PostgreSQL, Redis, shared config
│   └── backend/
│       └── .env          # Backend-specific config only
```

### `apps/shared/.env` (Shared Configuration)

Contains:
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DATABASE`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_SCHEMA`
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `API_PORT` (shared default)
- `API_HOST`

### `apps/backend/.env` (Backend-Specific Configuration)

Contains **only**:
- `FRONTEND_URL` - Frontend URL for CORS
- `JWT_SECRET` - JWT secret key
- `API_PORT` - Backend API port (can override shared)
- `NODE_ENV` - Environment mode
- `COINBASE_IMPORTER_HOST` - Coinbase importer gRPC host
- `COINBASE_IMPORTER_PORT` - Coinbase importer gRPC port

## Troubleshooting

### Database Connection Errors

**Error: `Connection refused`**
- Make sure PostgreSQL is running: `docker ps | grep postgres`
- Check the port: Docker uses `5433`, local uses `5432`
- Verify `apps/shared/.env` file has correct `POSTGRES_PORT`

**Error: `password authentication failed`**
- Check `POSTGRES_USER` and `POSTGRES_PASSWORD` in `apps/shared/.env`
- Default values: `arqos_user` / `arqos_password`

**Error: `database "arqos" does not exist`**
- Database should be auto-created by Docker
- If using local PostgreSQL, create it: `createdb -U arqos_user arqos`

### Environment Variables Not Loading

**Error: Database config not found**
- Make sure `apps/shared/.env` exists
- Check that the file path is correct
- Verify the backend loads shared config first (check `src/index.ts`)

**Error: Backend-specific config not working**
- Make sure `apps/backend/.env` exists
- Check that variables are correctly named
- Backend `.env` overrides shared `.env` values

### Port Already in Use

**Error: `EADDRINUSE: address already in use :::3000`**
- Change `API_PORT` in `apps/backend/.env` to a different port (e.g., `3001`)
- Or stop the process using port 3000:
  ```bash
  # Find process
  lsof -ti:3000
  
  # Kill it
  kill -9 $(lsof -ti:3000)
  ```

### Module Not Found Errors

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

### TypeScript Errors

```bash
# Rebuild
npm run build
```

## Environment Variables Reference

### Shared Variables (`apps/shared/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_HOST` | `localhost` | PostgreSQL host |
| `POSTGRES_PORT` | `5432` | PostgreSQL port (use `5433` for Docker) |
| `POSTGRES_DATABASE` | `arqos` | Database name |
| `POSTGRES_USER` | `arqos_user` | Database user |
| `POSTGRES_PASSWORD` | `arqos_password` | Database password |
| `POSTGRES_SCHEMA` | `public` | Database schema |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | - | Redis password (optional) |
| `API_PORT` | `3000` | API port (shared default) |
| `API_HOST` | `localhost` | API host |

### Backend-Specific Variables (`apps/backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `FRONTEND_URL` | `http://localhost:3000` | Frontend URL for CORS |
| `JWT_SECRET` | - | Secret for JWT tokens (required) |
| `API_PORT` | `3000` | Backend API port (overrides shared) |
| `NODE_ENV` | `development` | Environment mode |
| `COINBASE_IMPORTER_HOST` | `localhost` | Coinbase importer gRPC host |
| `COINBASE_IMPORTER_PORT` | `50051` | Coinbase importer gRPC port |

## Next Steps

Once the backend is running:

1. **Get admin credentials:**
   ```bash
   docker logs arqos-postgres | grep "Admin user"
   ```

2. **Login to get token:**
   ```bash
   curl -X POST http://localhost:3000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email": "admin@arqos.com", "password": "YOUR_PASSWORD"}'
   ```

3. **Test API endpoints** (see `BACKEND_API_CONSOLE_GUIDE.md`)

## Development Tips

- **Auto-reload**: `npm run dev` uses `nodemon` for automatic restarts
- **Logs**: Check console output for request logs (morgan middleware)
- **Database queries**: All queries are logged to console in development
- **Hot reload**: Changes to `.ts` files will automatically restart the server
- **Environment loading**: Backend loads `shared/.env` first, then `backend/.env` (which overrides)
