#!/bin/bash

# Docker Compose Run Script
# Combines root docker-compose.yml with importer-specific compose files
#
# Usage:
#   ./scripts/docker-compose-run.sh [importer] [command]
#   ./scripts/docker-compose-run.sh coinbase up
#   ./scripts/docker-compose-run.sh coinbase up -d
#   ./scripts/docker-compose-run.sh coinbase down
#   ./scripts/docker-compose-run.sh infrastructure up
#
# Examples:
#   ./scripts/docker-compose-run.sh coinbase up -d
#   ./scripts/docker-compose-run.sh infrastructure up
#   ./scripts/docker-compose-run.sh coinbase logs -f

set -e

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default command
DEFAULT_CMD="up"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print usage
usage() {
    echo "Usage: $0 [importer|infrastructure] [command] [options...]"
    echo ""
    echo "Importers:"
    echo "  coinbase    - Run coinbase importer with shared infrastructure"
    echo "  infrastructure - Run only shared infrastructure (postgres, redis)"
    echo ""
    echo "Commands:"
    echo "  up          - Start services (default)"
    echo "  down        - Stop services"
    echo "  logs        - View logs"
    echo "  ps          - List services"
    echo "  build       - Build services"
    echo ""
    echo "Examples:"
    echo "  $0 coinbase up -d"
    echo "  $0 infrastructure up"
    echo "  $0 coinbase logs -f"
    exit 1
}

# Check if at least one argument is provided
if [ $# -lt 1 ]; then
    usage
fi

IMPORTER=$1
shift
CMD=${1:-$DEFAULT_CMD}
shift
OPTIONS="$@"

# Change to project root
cd "$PROJECT_ROOT"

# Build docker compose command
COMPOSE_FILES="-f docker-compose.yml"

case $IMPORTER in
    infrastructure)
        # Only run shared infrastructure
        echo -e "${BLUE}Running shared infrastructure only...${NC}"
        docker compose $COMPOSE_FILES $CMD $OPTIONS
        ;;
    coinbase)
        # Add coinbase importer compose file
        COMPOSE_FILES="$COMPOSE_FILES -f apps/importers/coinbase/docker-compose.yml"
        echo -e "${BLUE}Running coinbase importer with shared infrastructure...${NC}"
        docker compose $COMPOSE_FILES $CMD $OPTIONS
        ;;
    *)
        echo -e "${RED}Error: Unknown importer '$IMPORTER'${NC}"
        echo ""
        usage
        ;;
esac

