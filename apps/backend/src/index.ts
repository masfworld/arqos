import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

import { errorHandler } from './middleware/errorHandler';
import { authRoutes } from './routes/auth';
import { portfolioRoutes } from './routes/portfolio';
import { exchangeRoutes } from './routes/exchanges';
import { transactionRoutes } from './routes/transactions';
import { alertRoutes } from './routes/alerts';
import { schedulerRoutes, schedulerService } from './routes/scheduler';
import { DatabaseService } from './services/DatabaseService';

// Load environment variables
// Load shared .env first, then backend-specific .env (which overrides shared)
const projectRoot = path.join(__dirname, '../');
const sharedRoot = path.join(projectRoot, '../shared');

const sharedEnvPath = path.join(sharedRoot, '.env');
const backendEnvPath = path.join(projectRoot, '.env');

// Load shared config first (silently fail if doesn't exist)
if (fs.existsSync(sharedEnvPath)) {
  dotenv.config({ path: sharedEnvPath });
  console.log(`✅ Loaded shared environment from: ${sharedEnvPath}`);
} else {
  console.warn(`⚠️  Shared environment file not found at: ${sharedEnvPath}`);
}

// Override with backend-specific config (silently fail if doesn't exist)
if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath, override: true });
  console.log(`✅ Loaded backend environment from: ${backendEnvPath}`);
} else {
  console.warn(`⚠️  Backend environment file not found at: ${backendEnvPath}`);
}

const app = express();
const PORT = process.env.API_PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In development, allow common Expo/React Native origins
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:8081',  // Expo default
      'http://localhost:19006', // Expo web
      'http://localhost:19000', // Expo web alternative
      'http://localhost:3000',  // Common frontend port
      'http://localhost:5173',  // Vite default
      'http://localhost:5174',  // Vite alternative
    ];
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // In development, log the origin for debugging
      if (process.env.NODE_ENV !== 'production') {
        console.log(`⚠️  CORS: Blocked origin: ${origin}`);
        console.log(`   Allowed origins: ${allowedOrigins.join(', ')}`);
        // In development, allow all origins for easier debugging
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/portfolio', portfolioRoutes);
app.use('/api/v1/exchanges', exchangeRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/v1/scheduler', schedulerRoutes);

// API documentation endpoint
app.get('/api/v1/docs', (req, res) => {
  res.json({
    name: 'Arqos API',
    version: '1.0.0',
    description: 'Crypto Portfolio Tracking API',
    endpoints: {
      auth: '/api/v1/auth',
      portfolio: '/api/v1/portfolio',
      exchanges: '/api/v1/exchanges',
      transactions: '/api/v1/transactions',
      alerts: '/api/v1/alerts',
      scheduler: '/api/v1/scheduler'
    },
    documentation: 'https://github.com/masfworld/arqos/tree/main/docs/api'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use(errorHandler);

// Initialize database connection
DatabaseService.initialize()
  .then(() => {
    console.log('Database connection established');
    
    // Initialize scheduler after database is ready
    return schedulerService.initialize();
  })
  .then(() => {
    console.log('Scheduler initialized');
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Arqos API Server running on port ${PORT}`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api/v1/docs`);
      console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize:', error);
    process.exit(1);
  });

export default app;

