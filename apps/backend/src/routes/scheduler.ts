/**
 * Scheduler API Routes
 * Handles CRUD operations for scheduled import jobs
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { CustomError } from '../middleware/errorHandler';
import { ImporterSchedulerService } from '../services/ImporterSchedulerService';
import { GrpcClientService } from '../services/GrpcClientService';
import '../middleware/auth'; // Import to ensure type declarations are available
import { DatabaseService } from '../services/DatabaseService';

const router = Router();

// Initialize services (singletons)
const db = DatabaseService.getInstance();
const grpcClient = new GrpcClientService();
export const schedulerService = new ImporterSchedulerService(db, grpcClient);

// Get all scheduled jobs for the authenticated user
router.get('/jobs', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    throw new CustomError('User not authenticated', 401);
  }

  const jobs = await schedulerService.getJobsByUser(userId);
  res.json(jobs);
}));

// Get a specific scheduled job by ID
router.get('/jobs/:id', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    throw new CustomError('User not authenticated', 401);
  }

  const { id } = req.params;
  const job = await schedulerService.getJobById(id);

  if (!job) {
    throw new CustomError('Job not found', 404);
  }

  // Verify job belongs to user
  if (job.user_id !== userId) {
    throw new CustomError('Unauthorized', 403);
  }

  res.json(job);
}));

// Create a new scheduled job
router.post('/jobs', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    throw new CustomError('User not authenticated', 401);
  }

  const { importer_name, source, cron_expression, description } = req.body;

  // Validate required fields
  if (!importer_name || !source || !cron_expression) {
    throw new CustomError('importer_name, source, and cron_expression are required', 400);
  }

  // Validate cron expression format (basic validation)
  // node-schedule uses cron format: "second minute hour day month dayOfWeek"
  const cronPattern = /^(\*|([0-9]|[1-5][0-9])|\*\/([0-9]|[1-5][0-9])) (\*|([0-9]|[1-5][0-9])|\*\/([0-9]|[1-5][0-9])) (\*|([01]?[0-9]|2[0-3])|\*\/([01]?[0-9]|2[0-3])) (\*|([1-9]|[12][0-9]|3[01])|\*\/([1-9]|[12][0-9]|3[01])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/;
  if (!cronPattern.test(cron_expression)) {
    throw new CustomError('Invalid cron expression format', 400);
  }

  // Validate importer name
  const validImporters = ['coinbase']; // Add more as needed
  if (!validImporters.includes(importer_name)) {
    throw new CustomError(`Invalid importer name. Valid values: ${validImporters.join(', ')}`, 400);
  }

  // Validate source
  const validSources = ['app', 'pro', 'all'];
  if (!validSources.includes(source)) {
    throw new CustomError(`Invalid source. Valid values: ${validSources.join(', ')}`, 400);
  }

  const job = await schedulerService.createJob(
    userId,
    importer_name,
    source,
    cron_expression,
    description
  );

  res.status(201).json(job);
}));

// Update a scheduled job
router.put('/jobs/:id', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    throw new CustomError('User not authenticated', 401);
  }

  const { id } = req.params;
  const { cron_expression, enabled, description } = req.body;

  // Verify job exists and belongs to user
  const existingJob = await schedulerService.getJobById(id);
  if (!existingJob) {
    throw new CustomError('Job not found', 404);
  }

  if (existingJob.user_id !== userId) {
    throw new CustomError('Unauthorized', 403);
  }

  // Validate cron expression if provided
  if (cron_expression) {
    const cronPattern = /^(\*|([0-9]|[1-5][0-9])|\*\/([0-9]|[1-5][0-9])) (\*|([0-9]|[1-5][0-9])|\*\/([0-9]|[1-5][0-9])) (\*|([01]?[0-9]|2[0-3])|\*\/([01]?[0-9]|2[0-3])) (\*|([1-9]|[12][0-9]|3[01])|\*\/([1-9]|[12][0-9]|3[01])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/;
    if (!cronPattern.test(cron_expression)) {
      throw new CustomError('Invalid cron expression format', 400);
    }
  }

  const job = await schedulerService.updateJob(id, cron_expression, enabled, description);
  res.json(job);
}));

// Delete a scheduled job
router.delete('/jobs/:id', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    throw new CustomError('User not authenticated', 401);
  }

  const { id } = req.params;

  // Verify job exists and belongs to user
  const existingJob = await schedulerService.getJobById(id);
  if (!existingJob) {
    throw new CustomError('Job not found', 404);
  }

  if (existingJob.user_id !== userId) {
    throw new CustomError('Unauthorized', 403);
  }

  await schedulerService.deleteJob(id);
  res.status(204).send();
}));

// Get status of an importer (via gRPC)
router.get('/importers/:name/status', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    throw new CustomError('User not authenticated', 401);
  }

  const { name } = req.params;

  // Get importer config from environment
  const importerConfigs: { [key: string]: { host: string; port: number } } = {
    coinbase: {
      host: process.env.COINBASE_IMPORTER_HOST || 'localhost',
      port: parseInt(process.env.COINBASE_IMPORTER_PORT || '50051', 10),
    },
  };

  const config = importerConfigs[name];
  if (!config) {
    throw new CustomError(`Importer ${name} not found`, 404);
  }

  const status = await grpcClient.getStatus({
    host: config.host,
    port: config.port,
    importerName: name,
  }, userId);

  res.json(status);
}));

// Get configuration of an importer (via gRPC)
router.get('/importers/:name/config', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    throw new CustomError('User not authenticated', 401);
  }

  const { name } = req.params;

  // Get importer config from environment
  const importerConfigs: { [key: string]: { host: string; port: number } } = {
    coinbase: {
      host: process.env.COINBASE_IMPORTER_HOST || 'localhost',
      port: parseInt(process.env.COINBASE_IMPORTER_PORT || '50051', 10),
    },
  };

  const config = importerConfigs[name];
  if (!config) {
    throw new CustomError(`Importer ${name} not found`, 404);
  }

  const importerConfig = await grpcClient.getConfig({
    host: config.host,
    port: config.port,
    importerName: name,
  }, userId);

  res.json(importerConfig);
}));

// Update configuration of an importer (via gRPC)
router.put('/importers/:name/config', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    throw new CustomError('User not authenticated', 401);
  }

  const { name } = req.params;
  const configData = req.body;

  // Get importer config from environment
  const importerConfigs: { [key: string]: { host: string; port: number } } = {
    coinbase: {
      host: process.env.COINBASE_IMPORTER_HOST || 'localhost',
      port: parseInt(process.env.COINBASE_IMPORTER_PORT || '50051', 10),
    },
  };

  const config = importerConfigs[name];
  if (!config) {
    throw new CustomError(`Importer ${name} not found`, 404);
  }

  const result = await grpcClient.setConfig(
    {
      host: config.host,
      port: config.port,
      importerName: name,
    },
    configData,
    userId
  );

  res.json(result);
}));

// Trigger manual import for an importer
router.post('/importers/:name/import', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    throw new CustomError('User not authenticated', 401);
  }

  const { name } = req.params;
  const { source = 'app' } = req.body;

  // Validate source
  const validSources = ['app', 'pro', 'all'];
  if (!validSources.includes(source)) {
    throw new CustomError(`Invalid source. Valid values: ${validSources.join(', ')}`, 400);
  }

  // Get importer config from environment
  const importerConfigs: { [key: string]: { host: string; port: number } } = {
    coinbase: {
      host: process.env.COINBASE_IMPORTER_HOST || 'localhost',
      port: parseInt(process.env.COINBASE_IMPORTER_PORT || '50051', 10),
    },
  };

  const config = importerConfigs[name];
  if (!config) {
    throw new CustomError(`Importer ${name} not found`, 404);
  }

  const result = await grpcClient.startImport(
    {
      host: config.host,
      port: config.port,
      importerName: name,
    },
    source,
    userId
  );

  res.json(result);
}));

export { router as schedulerRoutes };

