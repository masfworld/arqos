# Backend API Console Guide

## Prerequisites

1. **Backend must be running** (default port: 3000)
2. **Get admin user credentials** from database logs:
   ```bash
   docker logs arqos-postgres | grep "Admin user"
   ```

## Step 1: Login to Get Authentication Token

```bash
# Login with admin user (or any user)
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@arqos.com",
    "password": "YOUR_ADMIN_PASSWORD"
  }'
```

**Response:**
```json
{
  "user": {
    "id": "345bec70-fec4-430f-b86d-7f0645e88405",
    "email": "admin@arqos.com",
    ...
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Save the token** to an environment variable:
```bash
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## Step 2: Use Token for Authenticated Requests

All subsequent requests need the token in the Authorization header:
```bash
-H "Authorization: Bearer $TOKEN"
```

## API Endpoints Examples

### Trigger Coinbase Import

```bash
# Trigger Coinbase App import
curl -X POST http://localhost:3000/api/v1/exchanges/coinbase/import \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source": "app"}'

# Trigger Coinbase Pro import
curl -X POST http://localhost:3000/api/v1/exchanges/coinbase/import \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source": "pro"}'

# Trigger both (app + pro)
curl -X POST http://localhost:3000/api/v1/exchanges/coinbase/import \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source": "all"}'
```

### Get Coinbase App Accounts

```bash
curl -X GET "http://localhost:3000/api/v1/exchanges/coinbase/accounts?limit=10&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Coinbase App Transactions

```bash
# Get all transactions
curl -X GET "http://localhost:3000/api/v1/exchanges/coinbase/transactions?limit=50&offset=0" \
  -H "Authorization: Bearer $TOKEN"

# Get transactions filtered by type
curl -X GET "http://localhost:3000/api/v1/exchanges/coinbase/transactions?limit=50&offset=0&type=send" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Coinbase Pro Accounts

```bash
curl -X GET "http://localhost:3000/api/v1/exchanges/coinbase-pro/accounts?limit=10&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Coinbase Pro Fills

```bash
# Get all fills
curl -X GET "http://localhost:3000/api/v1/exchanges/coinbase-pro/fills?limit=50&offset=0" \
  -H "Authorization: Bearer $TOKEN"

# Get fills filtered by product
curl -X GET "http://localhost:3000/api/v1/exchanges/coinbase-pro/fills?limit=50&offset=0&product_id=ETH-EUR" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Exchange Balances

```bash
curl -X GET http://localhost:3000/api/v1/exchanges/balances \
  -H "Authorization: Bearer $TOKEN"
```

### Get Portfolio Holdings

```bash
curl -X GET http://localhost:3000/api/v1/portfolio/holdings \
  -H "Authorization: Bearer $TOKEN"
```

### Get Portfolio Summary

```bash
curl -X GET http://localhost:3000/api/v1/portfolio/summary \
  -H "Authorization: Bearer $TOKEN"
```

### Scheduler Endpoints

```bash
# Get importer status
curl -X GET http://localhost:3000/api/v1/scheduler/importers/coinbase/status \
  -H "Authorization: Bearer $TOKEN"

# Get importer config
curl -X GET http://localhost:3000/api/v1/scheduler/importers/coinbase/config \
  -H "Authorization: Bearer $TOKEN"

# Trigger import via scheduler route
curl -X POST http://localhost:3000/api/v1/scheduler/importers/coinbase/import \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source": "app"}'

# Get all scheduled jobs
curl -X GET http://localhost:3000/api/v1/scheduler/jobs \
  -H "Authorization: Bearer $TOKEN"
```

## Quick Test Script

Save this as `test-api.sh`:

```bash
#!/bin/bash

# Configuration
API_URL="http://localhost:3000"
EMAIL="admin@arqos.com"
PASSWORD="YOUR_PASSWORD_HERE"

# Login
echo "🔐 Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')
USER_ID=$(echo $LOGIN_RESPONSE | jq -r '.user.id')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Login failed!"
  echo $LOGIN_RESPONSE | jq .
  exit 1
fi

echo "✅ Logged in! User ID: $USER_ID"
echo ""

# Trigger import
echo "🚀 Triggering Coinbase App import..."
IMPORT_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/exchanges/coinbase/import" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source": "app"}')

echo $IMPORT_RESPONSE | jq .
echo ""

# Wait a bit for import to complete
echo "⏳ Waiting 5 seconds for import to complete..."
sleep 5

# Get accounts
echo "📊 Getting accounts..."
curl -s -X GET "$API_URL/api/v1/exchanges/coinbase/accounts?limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""

# Get transactions
echo "💸 Getting transactions..."
curl -s -X GET "$API_URL/api/v1/exchanges/coinbase/transactions?limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Make it executable and run:
```bash
chmod +x test-api.sh
./test-api.sh
```

## Using httpie (Alternative to curl)

If you prefer `httpie`:

```bash
# Install: brew install httpie (macOS) or apt install httpie (Linux)

# Login
http POST localhost:3000/api/v1/auth/login email=admin@arqos.com password=YOUR_PASSWORD

# Trigger import (use token from login response)
http POST localhost:3000/api/v1/exchanges/coinbase/import \
  Authorization:"Bearer YOUR_TOKEN" \
  source=app

# Get accounts
http GET localhost:3000/api/v1/exchanges/coinbase/accounts \
  Authorization:"Bearer YOUR_TOKEN" \
  limit==10
```

## Troubleshooting

1. **401 Unauthorized**: Make sure you're including the token in the Authorization header
2. **Connection refused**: Make sure the backend is running on port 3000
3. **Invalid credentials**: Check that you're using the correct admin password from database logs
4. **500 errors**: Check backend logs for detailed error messages

