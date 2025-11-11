/**
 * Unit tests for ImporterSchedulerService
 */

import { ImporterSchedulerService } from '../ImporterSchedulerService';
import { GrpcClientService } from '../GrpcClientService';
import { DatabaseService } from '../DatabaseService';

// Mock dependencies
jest.mock('../DatabaseService');
jest.mock('../GrpcClientService');
jest.mock('node-schedule', () => ({
  scheduleJob: jest.fn((cron: string, callback: () => void) => {
    return {
      cancel: jest.fn(),
      nextInvocation: jest.fn(() => ({
        toDate: jest.fn(() => new Date(Date.now() + 3600000)), // 1 hour from now
      })),
    };
  }),
}));

describe('ImporterSchedulerService', () => {
  let schedulerService: ImporterSchedulerService;
  let mockDb: jest.Mocked<DatabaseService>;
  let mockGrpcClient: jest.Mocked<GrpcClientService>;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
    } as any;

    mockGrpcClient = {
      startImport: jest.fn(),
      stopImport: jest.fn(),
      getStatus: jest.fn(),
      getConfig: jest.fn(),
      setConfig: jest.fn(),
    } as any;

    schedulerService = new ImporterSchedulerService(mockDb, mockGrpcClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createJob', () => {
    it('should create a new scheduled job', async () => {
      const userId = 'user-123';
      const importerName = 'coinbase';
      const source = 'app';
      const cronExpression = '0 * * * *'; // Every hour
      const description = 'Test job';

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'job-123',
          user_id: userId,
          importer_name: importerName,
          source,
          enabled: true,
          cron_expression: cronExpression,
          description,
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      const job = await schedulerService.createJob(
        userId,
        importerName,
        source,
        cronExpression,
        description
      );

      expect(job).toBeDefined();
      expect(job.id).toBe('job-123');
      expect(job.importer_name).toBe(importerName);
      expect(job.source).toBe(source);
      expect(mockDb.query).toHaveBeenCalled();
    });

    it('should throw error if job already exists', async () => {
      const userId = 'user-123';
      const importerName = 'coinbase';
      const source = 'app';
      const cronExpression = '0 * * * *';

      mockDb.query.mockRejectedValueOnce({
        code: '23505', // Unique constraint violation
      });

      await expect(
        schedulerService.createJob(userId, importerName, source, cronExpression)
      ).rejects.toThrow();
    });
  });

  describe('updateJob', () => {
    it('should update an existing job', async () => {
      const jobId = 'job-123';
      const newCronExpression = '0 */2 * * *'; // Every 2 hours

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: jobId,
          user_id: 'user-123',
          importer_name: 'coinbase',
          source: 'app',
          enabled: true,
          cron_expression: newCronExpression,
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      const job = await schedulerService.updateJob(jobId, newCronExpression);

      expect(job).toBeDefined();
      expect(job.cron_expression).toBe(newCronExpression);
      expect(mockDb.query).toHaveBeenCalled();
    });

    it('should disable a job', async () => {
      const jobId = 'job-123';

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: jobId,
          user_id: 'user-123',
          importer_name: 'coinbase',
          source: 'app',
          enabled: false,
          cron_expression: '0 * * * *',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      const job = await schedulerService.updateJob(jobId, undefined, false);

      expect(job.enabled).toBe(false);
    });
  });

  describe('deleteJob', () => {
    it('should delete a job', async () => {
      const jobId = 'job-123';

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await schedulerService.deleteJob(jobId);

      expect(mockDb.query).toHaveBeenCalledWith(
        'DELETE FROM scheduler.import_jobs WHERE id = $1',
        [jobId]
      );
    });
  });

  describe('getJobsByUser', () => {
    it('should return all jobs for a user', async () => {
      const userId = 'user-123';

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'job-1',
            user_id: userId,
            importer_name: 'coinbase',
            source: 'app',
            enabled: true,
            cron_expression: '0 * * * *',
          },
          {
            id: 'job-2',
            user_id: userId,
            importer_name: 'coinbase',
            source: 'pro',
            enabled: true,
            cron_expression: '0 */2 * * *',
          },
        ],
      });

      const jobs = await schedulerService.getJobsByUser(userId);

      expect(jobs).toHaveLength(2);
      expect(jobs[0].id).toBe('job-1');
      expect(jobs[1].id).toBe('job-2');
    });
  });
});

