# Arqos

**Crypto Portfolio Tracking System**

Arqos is a comprehensive cryptocurrency portfolio tracking system that aggregates data from multiple exchanges and provides a unified view of your crypto investments across different platforms.

## 🏗️ Architecture

Arqos follows a monorepo architecture with multiple sub-applications:

```
Arqos/
├── apps/
│   ├── importers/           # Data importers for different exchanges
│   │   ├── coinbase/        # Coinbase Pro & App data importer
│   │   ├── cardano/         # Cardano blockchain data importer (planned)
│   │   ├── binance/         # Binance exchange data importer (planned)
│   │   └── shared/          # Common importer utilities
│   ├── backend/             # Node.js REST API server
│   └── frontend/            # Expo/React Native mobile & web app
├── shared/
│   ├── database/            # PostgreSQL schemas & migrations
│   ├── types/               # Shared TypeScript types
│   └── utils/               # Common utilities
├── scripts/
│   └── docker-compose-run.sh # Docker Compose orchestration script
├── docker-compose.yml        # Shared infrastructure (postgres, redis)
└── README.md
```

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for backend development)
- Python 3.13+ (for importers)
- Expo CLI (for frontend development)

### Development Setup

1. **Clone and setup**
   ```bash
   git clone https://github.com/masfworld/arqos.git
   cd arqos
   ```

2. **Start shared infrastructure (PostgreSQL & Redis)**
   ```bash
   # Using the run script (recommended)
   ./scripts/docker-compose-run.sh infrastructure up -d
   
   # Or using docker compose directly
   docker compose up -d postgres redis
   ```

3. **Run Coinbase importer**
   ```bash
   # Setup environment file
   cd apps/importers/coinbase
   cp .env.example .env
   # Edit .env with your Coinbase API credentials
   cd ../..
   
   # Start coinbase importer with shared infrastructure
   ./scripts/docker-compose-run.sh coinbase up -d
   
   # Or using docker compose directly
   docker compose -f docker-compose.yml -f apps/importers/coinbase/docker-compose.yml up -d
   ```

4. **Start backend API**
   ```bash
   cd apps/backend
   npm install
   npm run dev
   ```

5. **Start frontend**
   ```bash
   cd apps/frontend
   npm install
   npx expo start
   ```

## 📊 Features

### Current Features
- ✅ Coinbase Pro & App data import
- ✅ PostgreSQL data storage
- ✅ Docker containerization
- ✅ RESTful API endpoints
- ✅ Mobile-first responsive UI

### Planned Features
- 🔄 Multi-exchange support (Binance, Cardano, etc.)
- 🔄 Real-time portfolio tracking
- 🔄 Performance analytics
- 🔄 Tax reporting
- 🔄 Mobile app (iOS/Android)
- 🔄 Web dashboard

## 🛠️ Technology Stack

- **Backend**: Node.js, Express.js, PostgreSQL, Prisma ORM
- **Frontend**: Expo, React Native, TypeScript
- **Importers**: Python, Poetry, Pandas
- **Infrastructure**: Docker, Docker Compose
- **Database**: PostgreSQL with Redis for caching

## 🐳 Docker Compose Structure

Arqos uses a modular Docker Compose setup:

- **Root `docker-compose.yml`**: Shared infrastructure (PostgreSQL, Redis)
- **Importer compose files**: Each importer defines only its service
- **Run script**: `./scripts/docker-compose-run.sh` combines compose files

### Usage Examples

```bash
# Start shared infrastructure only
./scripts/docker-compose-run.sh infrastructure up -d

# Start coinbase importer with shared infrastructure
./scripts/docker-compose-run.sh coinbase up -d

# View logs
./scripts/docker-compose-run.sh coinbase logs -f

# Stop services
./scripts/docker-compose-run.sh coinbase down
```

See individual importer READMEs for detailed setup instructions.

## 📝 License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📞 Support

For questions and support, please open an issue on GitHub.
