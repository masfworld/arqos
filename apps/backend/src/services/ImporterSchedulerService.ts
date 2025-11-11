/**
 * Importer Scheduler Service
 * Manages scheduled import jobs using node-schedule
 * Similar to APScheduler but implemented in Node.js
 */

import * as schedule from 'node-schedule';
import { DatabaseService } from './DatabaseService';
import { GrpcClientService, ImporterClientConfig } from './GrpcClientService';

export interface ScheduledJob {
  id: string;
  user_id: string;
  importer_name: string;
  source: string;
  enabled: boolean;
  cron_expression: string;
  description?: string;
  last_run_at?: Date;
  next_run_at?: Date;
  last_run_status?: string;
  last_run_error?: string;
}

export class ImporterSchedulerService {
  private db: DatabaseService;
  private grpcClient: GrpcClientService;
  private scheduledJobs: Map<string, schedule.Job> = new Map();
  private importerConfigs: Map<string, ImporterClientConfig> = new Map();

  constructor(db: DatabaseService, grpcClient: GrpcClientService) {
    this.db = db;
    this.grpcClient = grpcClient;
  }

  /**
   * Initialize scheduler - load jobs from database and schedule them
   */
  async initialize(): Promise<void> {
    console.log('Initializing Importer Scheduler Service...');

    // Load importer configurations from environment
    this.loadImporterConfigs();

    // Load and schedule all enabled jobs
    await this.loadAndScheduleJobs();
  }

  /**
   * Load importer configurations from environment variables
   */
  private loadImporterConfigs(): void {
    // Coinbase importer config
    const coinbaseHost = process.env.COINBASE_IMPORTER_HOST || 'localhost';
    const coinbasePort = parseInt(process.env.COINBASE_IMPORTER_PORT || '50051', 10);

    this.importerConfigs.set('coinbase', {
      host: coinbaseHost,
      port: coinbasePort,
      importerName: 'coinbase',
    });

    // Add other importers here as they are added
  }

  /**
   * Get importer config by name
   */
  private getImporterConfig(importerName: string): ImporterClientConfig | null {
    return this.importerConfigs.get(importerName) || null;
  }

  /**
   * Load all enabled jobs from database and schedule them
   */
  async loadAndScheduleJobs(): Promise<void> {
    try {
      const result = await this.db.query(
        `SELECT * FROM scheduler.import_jobs WHERE enabled = true`
      );

      console.log(`Loading ${result.rows.length} scheduled jobs from database...`);

      for (const row of result.rows) {
        await this.scheduleJob(row);
      }

      console.log('Scheduler initialized successfully');
    } catch (error) {
      console.error('Error loading scheduled jobs:', error);
      throw error;
    }
  }

  /**
   * Schedule a single job
   */
  async scheduleJob(jobData: ScheduledJob): Promise<void> {
    const jobId = jobData.id;

    // Cancel existing job if any
    if (this.scheduledJobs.has(jobId)) {
      this.scheduledJobs.get(jobId)?.cancel();
    }

    // Get importer config
    const importerConfig = this.getImporterConfig(jobData.importer_name);
    if (!importerConfig) {
      console.error(`Importer config not found for: ${jobData.importer_name}`);
      return;
    }

    // Create scheduled job
    const job = schedule.scheduleJob(jobData.cron_expression, async () => {
      await this.executeJob(jobData, importerConfig);
    });

    if (job) {
      this.scheduledJobs.set(jobId, job);
      console.log(`Scheduled job: ${jobData.importer_name}/${jobData.source} (${jobData.cron_expression})`);

      // Update next_run_at in database
      const nextRun = job.nextInvocation();
      if (nextRun) {
        await this.db.query(
          `UPDATE scheduler.import_jobs 
           SET next_run_at = $1 
           WHERE id = $2`,
          [nextRun, jobId]
        );
      }
    } else {
      console.error(`Failed to schedule job: ${jobData.id} (invalid cron expression?)`);
    }
  }

  /**
   * Execute a scheduled job
   */
  private async executeJob(jobData: ScheduledJob, importerConfig: ImporterClientConfig): Promise<void> {
    const jobId = jobData.id;
    console.log(`Executing scheduled job: ${jobData.importer_name}/${jobData.source} (${jobId})`);

    try {
      // Update job status to running
      await this.db.query(
        `UPDATE scheduler.import_jobs 
         SET last_run_at = CURRENT_TIMESTAMP, 
             last_run_status = 'running',
             last_run_error = NULL
         WHERE id = $1`,
        [jobId]
      );

      // Execute import via gRPC
      const result = await this.grpcClient.startImport(importerConfig, jobData.source, jobData.user_id);

      // Update job status based on result
      await this.db.query(
        `UPDATE scheduler.import_jobs 
         SET last_run_status = $1,
             last_run_error = $2
         WHERE id = $3`,
        [result.success ? 'success' : 'failed', result.message, jobId]
      );

      // Update next run time
      const job = this.scheduledJobs.get(jobId);
      if (job) {
        const nextRun = job.nextInvocation();
        if (nextRun) {
          await this.db.query(
            `UPDATE scheduler.import_jobs 
             SET next_run_at = $1 
             WHERE id = $2`,
            [nextRun, jobId]
          );
        }
      }

      console.log(`Job execution completed: ${jobId} (${result.success ? 'success' : 'failed'})`);
    } catch (error: any) {
      console.error(`Job execution failed: ${jobId}`, error);

      // Update job status to failed
      await this.db.query(
        `UPDATE scheduler.import_jobs 
         SET last_run_status = 'failed',
             last_run_error = $1
         WHERE id = $2`,
        [error.message || 'Unknown error', jobId]
      );
    }
  }

  /**
   * Create a new scheduled job
   */
  async createJob(
    userId: string,
    importerName: string,
    source: string,
    cronExpression: string,
    description?: string
  ): Promise<ScheduledJob> {
    try {
      const result = await this.db.query(
        `INSERT INTO scheduler.import_jobs 
         (user_id, importer_name, source, cron_expression, description, enabled)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING *`,
        [userId, importerName, source, cronExpression, description || null]
      );

      const jobData = this.mapRowToJob(result.rows[0]);
      await this.scheduleJob(jobData);

      return jobData;
    } catch (error: any) {
      if (error.code === '23505') {
        // Unique constraint violation
        throw new Error(`Job already exists for ${importerName}/${source}`);
      }
      throw error;
    }
  }

  /**
   * Update an existing scheduled job
   */
  async updateJob(
    jobId: string,
    cronExpression?: string,
    enabled?: boolean,
    description?: string
  ): Promise<ScheduledJob> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (cronExpression !== undefined) {
      updates.push(`cron_expression = $${paramIndex++}`);
      values.push(cronExpression);
    }

    if (enabled !== undefined) {
      updates.push(`enabled = $${paramIndex++}`);
      values.push(enabled);
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(jobId);
    updates.push(`WHERE id = $${paramIndex++}`);

    const result = await this.db.query(
      `UPDATE scheduler.import_jobs 
       SET ${updates.join(', ')}
       RETURNING *`,
      values
    );

    const jobData = this.mapRowToJob(result.rows[0]);

    // Re-schedule if enabled
    if (jobData.enabled) {
      await this.scheduleJob(jobData);
    } else {
      // Cancel if disabled
      if (this.scheduledJobs.has(jobId)) {
        this.scheduledJobs.get(jobId)?.cancel();
        this.scheduledJobs.delete(jobId);
      }
    }

    return jobData;
  }

  /**
   * Delete a scheduled job
   */
  async deleteJob(jobId: string): Promise<void> {
    // Cancel the job
    if (this.scheduledJobs.has(jobId)) {
      this.scheduledJobs.get(jobId)?.cancel();
      this.scheduledJobs.delete(jobId);
    }

    // Delete from database
    await this.db.query(`DELETE FROM scheduler.import_jobs WHERE id = $1`, [jobId]);
  }

  /**
   * Get all jobs for a user
   */
  async getJobsByUser(userId: string): Promise<ScheduledJob[]> {
    const result = await this.db.query(
      `SELECT * FROM scheduler.import_jobs WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows.map((row: any) => this.mapRowToJob(row));
  }

  /**
   * Get a job by ID
   */
  async getJobById(jobId: string): Promise<ScheduledJob | null> {
    const result = await this.db.query(
      `SELECT * FROM scheduler.import_jobs WHERE id = $1`,
      [jobId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToJob(result.rows[0]);
  }

  /**
   * Map database row to ScheduledJob
   */
  private mapRowToJob(row: any): ScheduledJob {
    return {
      id: row.id,
      user_id: row.user_id,
      importer_name: row.importer_name,
      source: row.source,
      enabled: row.enabled,
      cron_expression: row.cron_expression,
      description: row.description,
      last_run_at: row.last_run_at,
      next_run_at: row.next_run_at,
      last_run_status: row.last_run_status,
      last_run_error: row.last_run_error,
    };
  }

  /**
   * Shutdown scheduler - cancel all jobs
   */
  shutdown(): void {
    console.log('Shutting down scheduler...');
    this.scheduledJobs.forEach((job, jobId) => {
      job.cancel();
      console.log(`Cancelled job: ${jobId}`);
    });
    this.scheduledJobs.clear();
  }
}

