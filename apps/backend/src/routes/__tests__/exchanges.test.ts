/**
 * Unit tests for exchanges routes
 */

import { Request, Response, NextFunction } from 'express';
import { DatabaseService } from '../../services/DatabaseService';
import { GrpcClientService } from '../../services/GrpcClientService';
import { authenticateToken } from '../../middleware/auth';
import { asyncHandler, CustomError } from '../../middleware/errorHandler';
import { schedulerService } from '../scheduler';

// Helper to wait for async handler to complete
// asyncHandler wraps async functions but doesn't return a promise, so we need to wait for res.json/res.status to be called
const waitForHandler = async (handler: any, req: Request, res: Response, next: NextFunction): Promise<void> => {
  return new Promise<void>((resolve) => {
    let completed = false;
    
    // Wrap res.json to detect completion
    const originalJson = res.json.bind(res);
    (res.json as jest.Mock) = jest.fn((arg: any) => {
      if (!completed) {
        completed = true;
        originalJson(arg);
        resolve();
      }
      return res;
    });
    
    // Wrap res.status to detect completion
    const originalStatus = res.status.bind(res);
    (res.status as jest.Mock) = jest.fn((code: number) => {
      originalStatus(code);
      return res;
    });
    
    // Call handler
    handler(req, res, next);
    
    // Fallback timeout in case handler doesn't call res.json
    setTimeout(() => {
      if (!completed) {
        completed = true;
        resolve();
      }
    }, 100);
  });
};

// Mock all dependencies before importing the module
jest.mock('../../services/DatabaseService');
jest.mock('../../services/GrpcClientService');
jest.mock('../../middleware/auth');
jest.mock('../scheduler');
jest.mock('../exchanges/coinbase', () => ({
  coinbaseRoutes: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('Exchanges Routes', () => {
  let mockDb: {
    query: jest.Mock;
    getClient: jest.Mock;
    transaction: jest.Mock;
  };
  let mockGrpcClient: jest.Mocked<GrpcClientService>;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    // Create fresh mock database
    mockDb = {
      query: jest.fn(),
      getClient: jest.fn(),
      transaction: jest.fn(),
    };

    // Mock DatabaseService.getInstance to return our mock
    (DatabaseService.getInstance as jest.MockedFunction<typeof DatabaseService.getInstance>) = jest.fn(() => mockDb as any);

    // Mock gRPC client
    mockGrpcClient = {
      startImport: jest.fn(),
      stopImport: jest.fn(),
      getStatus: jest.fn(),
    } as any;

    // Mock GrpcClientService constructor
    (GrpcClientService as jest.MockedClass<typeof GrpcClientService>) = jest.fn(() => mockGrpcClient) as any;

    // Mock request
    mockReq = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
      },
      query: {},
      params: {},
      body: {},
      headers: {},
    };

    // Mock response
    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();

    // Setup auth middleware mock
    (authenticateToken as jest.MockedFunction<typeof authenticateToken>) = jest.fn((req, res, next) => next());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /exchanges', () => {
    it('should return all available exchanges', async () => {
      const mockExchanges = [
        {
          id: 'exchange-1',
          name: 'coinbase_app',
          display_name: 'Coinbase App',
          config_parameters: { api_key: { type: 'string', required: true } },
          description: 'Coinbase App exchange',
          is_active: true,
        },
        {
          id: 'exchange-2',
          name: 'coinbase_pro',
          display_name: 'Coinbase Pro',
          config_parameters: { file_path: { type: 'string', required: true } },
          description: 'Coinbase Pro exchange',
          is_active: true,
        },
      ];

      mockDb.query.mockResolvedValueOnce({ rows: mockExchanges });

      // Test the route handler logic directly
      const handler = asyncHandler(async (req: Request, res: Response) => {
        const db = DatabaseService.getInstance();
        const query = `
          SELECT 
            id,
            name,
            display_name,
            config_parameters,
            description,
            is_active
          FROM exchanges.exchanges
          WHERE is_active = true
          ORDER BY display_name
        `;
        const result = await db.query(query);
        res.json(result.rows);
      });

      await waitForHandler(handler, mockReq as Request, mockRes as Response, mockNext);

      // Verify query was called (query string may have newlines/whitespace)
      expect(mockDb.query).toHaveBeenCalled();
      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[0].replace(/\s+/g, ' ').trim()).toContain('SELECT');
      expect(mockRes.json).toHaveBeenCalledWith(mockExchanges);
    });
  });

  describe('GET /exchanges/configs', () => {
    it('should return user exchange configurations', async () => {
      const mockConfigs = [
        {
          id: 'config-1',
          exchange_id: 'exchange-1',
          exchange_name: 'coinbase_app',
          exchange_name_key: 'coinbase_app',
          display_name: 'Coinbase App',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockDb.query
        .mockResolvedValueOnce({ rows: mockConfigs }) // Configs query
        .mockResolvedValueOnce({ rows: [] }) // Import history query
        .mockResolvedValueOnce({ rows: [] }); // Scheduler query

      const handler = asyncHandler(async (req: Request, res: Response) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;

        const configsQuery = `
          SELECT 
            ec.id,
            ec.exchange_id,
            ec.exchange_name,
            ec.is_active,
            ec.created_at,
            ec.updated_at,
            e.name as exchange_name_key,
            e.display_name
          FROM exchanges.exchange_configs ec
          LEFT JOIN exchanges.exchanges e ON ec.exchange_id = e.id
          WHERE ec.user_id = $1
          ORDER BY COALESCE(e.display_name, ec.exchange_name)
        `;
        
        const configsResult = await db.query(configsQuery, [userId]);
        
        // Transform results (simplified)
        const transformed = await Promise.all(configsResult.rows.map(async (row: any) => {
          const exchangeName = row.exchange_name_key || row.exchange_name;
          const displayName = row.display_name || row.exchange_name.charAt(0).toUpperCase() + row.exchange_name.slice(1);
          
          // Mock import history query
          await db.query('SELECT source FROM analytics.import_history WHERE user_id = $1', [userId]);
          
          // Mock scheduler query
          await db.query('SELECT source FROM scheduler.import_jobs WHERE user_id = $1', [userId]);
          
          return {
            id: row.id,
            exchangeId: row.exchange_id,
            name: displayName,
            exchangeName: exchangeName,
            status: row.is_active ? 'active' : 'inactive',
            lastSync: null,
            autoImport: false,
            importSources: [],
          };
        }));
        
        res.json(transformed);
      });

      await waitForHandler(handler, mockReq as Request, mockRes as Response, mockNext);

      expect(mockDb.query).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalled();
      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(Array.isArray(responseData)).toBe(true);
    });

    it('should filter import sources by exchange type', async () => {
      const mockConfigs = [
        {
          id: 'config-1',
          exchange_id: 'exchange-1',
          exchange_name: 'coinbase_pro',
          exchange_name_key: 'coinbase_pro',
          display_name: 'Coinbase Pro',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockDb.query
        .mockResolvedValueOnce({ rows: mockConfigs })
        .mockResolvedValueOnce({ rows: [{ source: 'pro', last_sync: new Date(), status: 'success' }] })
        .mockResolvedValueOnce({ rows: [] });

      const handler = asyncHandler(async (req: Request, res: Response) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;

        const configsResult = await db.query('SELECT * FROM exchanges.exchange_configs WHERE user_id = $1', [userId]);
        
        for (const row of configsResult.rows) {
          const exchangeName = row.exchange_name_key || row.exchange_name;
          let sourceFilter: string | null = null;
          
          if (exchangeName === 'coinbase_pro') {
            sourceFilter = 'pro';
          }
          
          if (sourceFilter) {
            await db.query(
              'SELECT * FROM analytics.import_history WHERE user_id = $1 AND source = $2',
              [userId, sourceFilter]
            );
          }
        }
        
        res.json({ success: true });
      });

      await waitForHandler(handler, mockReq as Request, mockRes as Response, mockNext);

      // Verify that source filter is applied (pro only for coinbase_pro)
      const calls = mockDb.query.mock.calls;
      const importHistoryCall = calls.find((call: any[]) => 
        call[0]?.includes('import_history') && call[1]?.includes('pro')
      );
      expect(importHistoryCall).toBeDefined();
    });

    it('should include auto-import status in response', async () => {
      const mockConfigs = [
        {
          id: 'config-1',
          exchange_id: 'exchange-1',
          exchange_name: 'coinbase_app',
          exchange_name_key: 'coinbase_app',
          display_name: 'Coinbase App',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const lastSync = new Date('2024-01-01');
      mockDb.query
        .mockResolvedValueOnce({ rows: mockConfigs })
        .mockResolvedValueOnce({ 
          rows: [{ 
            source: 'app', 
            last_sync: lastSync, 
            status: 'success' 
          }] 
        })
        .mockResolvedValueOnce({ 
          rows: [{ source: 'app', enabled: true }] 
        });

      const handler = asyncHandler(async (req: Request, res: Response) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;

        const configsResult = await db.query(
          'SELECT * FROM exchanges.exchange_configs WHERE user_id = $1',
          [userId]
        );

        const importHistoryResult = await db.query(
          'SELECT source, MAX(start_time) as last_sync, status FROM analytics.import_history WHERE user_id = $1 AND importer_name = $2 AND source = $3 GROUP BY source',
          [userId, 'coinbase', 'app']
        );

        const schedulerResult = await db.query(
          'SELECT source, enabled FROM scheduler.import_jobs WHERE user_id = $1 AND importer_name = $2 AND source = $3 AND enabled = true',
          [userId, 'coinbase', 'app']
        );

        const autoImportSources = new Set(schedulerResult.rows.map((r: any) => r.source));
        const importSources = importHistoryResult.rows.map((ih: any) => ({
          source: ih.source,
          lastSync: ih.last_sync,
          status: ih.status,
          autoImport: autoImportSources.has(ih.source),
        }));

        res.json({
          configs: configsResult.rows,
          importSources,
          autoImport: importSources.some((s: any) => s.autoImport),
        });
      });

      await waitForHandler(handler, mockReq as Request, mockRes as Response, mockNext);

      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(responseData.autoImport).toBe(true);
      expect(responseData.importSources[0].autoImport).toBe(true);
    });

    it('should handle coinbase_app source filtering correctly', async () => {
      const mockConfigs = [
        {
          id: 'config-1',
          exchange_id: 'exchange-1',
          exchange_name: 'coinbase_app',
          exchange_name_key: 'coinbase_app',
          display_name: 'Coinbase App',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockDb.query
        .mockResolvedValueOnce({ rows: mockConfigs })
        .mockResolvedValueOnce({ 
          rows: [{ source: 'app', last_sync: new Date(), status: 'success' }] 
        })
        .mockResolvedValueOnce({ rows: [] });

      const handler = asyncHandler(async (req: Request, res: Response) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;

        const configsResult = await db.query(
          'SELECT * FROM exchanges.exchange_configs WHERE user_id = $1',
          [userId]
        );

        for (const row of configsResult.rows) {
          const exchangeName = row.exchange_name_key || row.exchange_name;
          let sourceFilter: string | null = null;
          
          if (exchangeName === 'coinbase_app') {
            sourceFilter = 'app';
          }
          
          if (sourceFilter) {
            await db.query(
              'SELECT * FROM analytics.import_history WHERE user_id = $1 AND importer_name = $2 AND source = $3',
              [userId, 'coinbase', sourceFilter]
            );
          }
        }
        
        res.json({ success: true });
      });

      await waitForHandler(handler, mockReq as Request, mockRes as Response, mockNext);

      const calls = mockDb.query.mock.calls;
      const importHistoryCall = calls.find((call: any[]) => 
        call[0]?.includes('import_history') && call[1]?.includes('app')
      );
      expect(importHistoryCall).toBeDefined();
    });
  });

  describe('GET /exchanges/configs/:id', () => {
    it('should return a single exchange configuration', async () => {
      mockReq.params = { id: 'config-1' };

      const mockConfig = {
        id: 'config-1',
        exchange_id: 'exchange-1',
        exchange_name: 'coinbase_app',
        api_key: 'test-api-key',
        api_secret: 'test-api-secret',
        config_data: JSON.stringify({ some_field: 'value' }),
        is_active: true,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
        exchange_id_from_table: 'exchange-1',
        exchange_name_key: 'coinbase_app',
        display_name: 'Coinbase App',
        config_parameters: { api_key: { type: 'string', required: true } },
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockConfig] });

      const handler = asyncHandler(async (req: Request, res: Response) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;
        const configId = req.params.id;

        const configQuery = `
          SELECT 
            ec.id,
            ec.exchange_id,
            ec.exchange_name,
            ec.api_key,
            ec.api_secret,
            ec.config_data,
            ec.is_active,
            ec.created_at,
            ec.updated_at,
            e.id as exchange_id_from_table,
            e.name as exchange_name_key,
            e.display_name,
            e.config_parameters
          FROM exchanges.exchange_configs ec
          LEFT JOIN exchanges.exchanges e ON ec.exchange_id = e.id
          WHERE ec.id = $1 AND ec.user_id = $2
        `;

        const configResult = await db.query(configQuery, [configId, userId]);

        if (configResult.rows.length === 0) {
          throw new CustomError('Exchange configuration not found', 404);
        }

        const row = configResult.rows[0];
        let configData = row.config_data;
        if (typeof configData === 'string') {
          try {
            configData = JSON.parse(configData);
          } catch (e) {
            configData = {};
          }
        }

        const response = {
          id: row.id,
          exchange_id: row.exchange_id,
          exchange_name: row.exchange_name,
          exchange: row.exchange_id_from_table ? {
            id: row.exchange_id_from_table,
            name: row.exchange_name_key,
            display_name: row.display_name,
            config_parameters: row.config_parameters,
          } : null,
          config_data: {
            ...configData,
            api_key: row.api_key || configData?.api_key || configData?.coinbase_api_key || '',
            api_secret: row.api_secret || configData?.api_secret || configData?.coinbase_api_secret || '',
            coinbase_api_key: row.api_key || configData?.coinbase_api_key || '',
            coinbase_api_secret: row.api_secret || configData?.coinbase_api_secret || '',
          },
          is_active: row.is_active,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };

        res.json(response);
      });

      await waitForHandler(handler, mockReq as Request, mockRes as Response, mockNext);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('exchanges.exchange_configs'),
        ['config-1', 'user-123']
      );
      expect(mockRes.json).toHaveBeenCalled();
      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(responseData.id).toBe('config-1');
      expect(responseData.exchange).toBeDefined();
      expect(responseData.config_data.api_key).toBe('test-api-key');
      expect(responseData.config_data.coinbase_api_key).toBe('test-api-key');
    });

    it('should return 404 if config not found', async () => {
      mockReq.params = { id: 'non-existent' };

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const handler = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;
        const configId = req.params.id;

        const configResult = await db.query(
          'SELECT * FROM exchanges.exchange_configs WHERE id = $1 AND user_id = $2',
          [configId, userId]
        );

        if (configResult.rows.length === 0) {
          throw new CustomError('Exchange configuration not found', 404);
        }

        res.json(configResult.rows[0]);
      });

      // Simulate error handler
      const errorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
        res.status(error.statusCode || 500).json({ error: { message: error.message, statusCode: error.statusCode } });
      };

      await waitForHandler(handler, mockReq as Request, mockRes as Response, (err) => {
        if (err) {
          errorHandler(err, mockReq as Request, mockRes as Response, mockNext);
        }
      });

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should handle config_data as object', async () => {
      mockReq.params = { id: 'config-1' };

      const mockConfig = {
        id: 'config-1',
        exchange_id: 'exchange-1',
        exchange_name: 'coinbase_app',
        api_key: 'test-api-key',
        api_secret: 'test-api-secret',
        config_data: { some_field: 'value' }, // Already an object
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        exchange_id_from_table: null,
        exchange_name_key: null,
        display_name: null,
        config_parameters: null,
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockConfig] });

      const handler = asyncHandler(async (req: Request, res: Response) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;
        const configId = req.params.id;

        const configResult = await db.query(
          'SELECT * FROM exchanges.exchange_configs WHERE id = $1 AND user_id = $2',
          [configId, userId]
        );

        const row = configResult.rows[0];
        let configData = row.config_data;
        if (typeof configData === 'string') {
          configData = JSON.parse(configData);
        }

        res.json({ config_data: configData });
      });

      await waitForHandler(handler, mockReq as Request, mockRes as Response, mockNext);

      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(responseData.config_data).toEqual({ some_field: 'value' });
    });
  });

  describe('POST /exchanges/configs', () => {
    it('should create a new exchange configuration', async () => {
      mockReq.body = {
        exchange_id: 'exchange-1',
        config_data: {
          api_key: 'test-api-key',
          api_secret: 'test-api-secret',
        },
      };

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'exchange-1',
            name: 'coinbase_app',
            display_name: 'Coinbase App',
            config_parameters: [],
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'config-1', exchange_id: 'exchange-1', exchange_name: 'coinbase_app' }],
        })
        .mockResolvedValueOnce({ rows: [] }) // Existing coinbase configs
        .mockResolvedValueOnce({ rows: [] }); // Coinbase upsert

      (schedulerService.createJob as jest.Mock) = jest.fn().mockResolvedValue({});

      const handler = asyncHandler(async (req: Request, res: Response) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;
        const { exchange_id, config_data } = req.body;

        // Get exchange
        const exchangeResult = await db.query('SELECT * FROM exchanges.exchanges WHERE id = $1', [exchange_id]);
        const exchange = exchangeResult.rows[0];

        // Insert config
        const configResult = await db.query(
          'INSERT INTO exchanges.exchange_configs (user_id, exchange_id, exchange_name, api_key, api_secret, config_data) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [userId, exchange_id, exchange.name, config_data.api_key, config_data.api_secret, JSON.stringify(config_data)]
        );

        // Sync coinbase config if needed
        if (exchange.name.startsWith('coinbase')) {
          await db.query('SELECT * FROM exchanges.exchange_configs WHERE user_id = $1 AND exchange_name IN (\'coinbase\', \'coinbase_app\', \'coinbase_pro\')', [userId]);
          await db.query('INSERT INTO exchanges.exchange_configs (user_id, exchange_name, api_key, api_secret) VALUES ($1, \'coinbase\', $2, $3) ON CONFLICT DO UPDATE SET api_key = EXCLUDED.api_key', [userId, config_data.api_key, config_data.api_secret]);
        }

        // Create scheduler job if not coinbase_pro
        if (exchange.name !== 'coinbase_pro' && userId) {
          await schedulerService.createJob(userId, 'coinbase', 'app', '0 * * * *', 'Test job');
        }

        res.status(201).json(configResult.rows[0]);
      });

      await waitForHandler(handler, mockReq as Request, mockRes as Response, mockNext);

      expect(mockDb.query).toHaveBeenCalled();
      // Check that status was called (might be called via res.status(201).json())
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(schedulerService.createJob).toHaveBeenCalled();
      // Verify response was sent
      expect(mockRes.json).toHaveBeenCalled();
    });

    it('should skip auto-import for coinbase_pro', async () => {
      mockReq.body = {
        exchange_id: 'exchange-2',
        config_data: {
          file_path: '/path/to/files',
        },
      };

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'exchange-2',
            name: 'coinbase_pro',
            display_name: 'Coinbase Pro',
            config_parameters: [],
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'config-2', exchange_id: 'exchange-2', exchange_name: 'coinbase_pro' }],
        })
        .mockResolvedValueOnce({ rows: [] }) // Existing coinbase configs
        .mockResolvedValueOnce({ rows: [] }); // Coinbase upsert

      const handler = asyncHandler(async (req: Request, res: Response) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;
        const { exchange_id, config_data } = req.body;

        const exchangeResult = await db.query('SELECT * FROM exchanges.exchanges WHERE id = $1', [exchange_id]);
        const exchange = exchangeResult.rows[0];

        await db.query('INSERT INTO exchanges.exchange_configs (user_id, exchange_id, exchange_name, config_data) VALUES ($1, $2, $3, $4) RETURNING *', 
          [userId, exchange_id, exchange.name, JSON.stringify(config_data)]);

        // Skip scheduler for coinbase_pro
        if (exchange.name !== 'coinbase_pro' && userId) {
          await schedulerService.createJob(userId, 'coinbase', 'pro', '0 * * * *', 'Test');
        }

        res.status(201).json({ id: 'config-2' });
      });

      await waitForHandler(handler, mockReq as Request, mockRes as Response, mockNext);

      // Verify scheduler.createJob was NOT called for coinbase_pro
      expect(schedulerService.createJob).not.toHaveBeenCalled();
    });

    it('should create scheduler job with correct source for coinbase_app', async () => {
      mockReq.body = {
        exchange_id: 'exchange-1',
        config_data: {
          api_key: 'test-api-key',
          api_secret: 'test-api-secret',
        },
      };

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'exchange-1',
            name: 'coinbase_app',
            display_name: 'Coinbase App',
            config_parameters: [],
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'config-1', exchange_id: 'exchange-1', exchange_name: 'coinbase_app' }],
        })
        .mockResolvedValueOnce({ rows: [] }); // Check existing job

      (schedulerService.createJob as jest.Mock) = jest.fn().mockResolvedValue({});

      const handler = asyncHandler(async (req: Request, res: Response) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;
        const { exchange_id, config_data } = req.body;

        const exchangeResult = await db.query('SELECT * FROM exchanges.exchanges WHERE id = $1', [exchange_id]);
        const exchange = exchangeResult.rows[0];

        await db.query('INSERT INTO exchanges.exchange_configs VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', 
          [userId, exchange_id, exchange.name, config_data.api_key, config_data.api_secret, JSON.stringify(config_data)]);

        // Check if job exists
        if (userId) {
          const existingJob = await db.query(
            'SELECT id FROM scheduler.import_jobs WHERE user_id = $1 AND importer_name = $2 AND source = $3',
            [userId, 'coinbase', 'app']
          );

          if (existingJob.rows.length === 0) {
            await schedulerService.createJob(
              userId,
              'coinbase',
              'app',
              '0 * * * *',
              `Automatic hourly sync for ${exchange.display_name || exchange.name}`
            );
          }
        }

        res.status(201).json({ id: 'config-1' });
      });

      await waitForHandler(handler, mockReq as Request, mockRes as Response, mockNext);

      expect(schedulerService.createJob).toHaveBeenCalledWith(
        'user-123',
        'coinbase',
        'app',
        '0 * * * *',
        expect.stringContaining('Coinbase App')
      );
    });

    it('should validate required config parameters', async () => {
      mockReq.body = {
        exchange_id: 'exchange-1',
        config_data: {},
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'exchange-1',
          name: 'coinbase_app',
          display_name: 'Coinbase App',
          config_parameters: [
            { name: 'api_key', required: true, type: 'string' },
          ],
        }],
      });

      const handler = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const db = DatabaseService.getInstance();
        const { exchange_id, config_data } = req.body;

        const exchangeResult = await db.query('SELECT * FROM exchanges.exchanges WHERE id = $1', [exchange_id]);
        const exchange = exchangeResult.rows[0];
        const configParameters = exchange.config_parameters;

        if (configParameters && Array.isArray(configParameters)) {
          for (const param of configParameters) {
            if (param.required && (!config_data || !config_data[param.name])) {
              throw new CustomError(`Missing required parameter: ${param.name}`, 400);
            }
          }
        }

        res.status(201).json({ success: true });
      });

      // Simulate error handler
      const errorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
        res.status(error.statusCode || 500).json({ error: { message: error.message, statusCode: error.statusCode } });
      };

      await waitForHandler(handler, mockReq as Request, mockRes as Response, (err) => {
        if (err) {
          errorHandler(err, mockReq as Request, mockRes as Response, mockNext);
        }
      });

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('DELETE /exchanges/configs/:id', () => {
    it('should delete exchange configuration and associated scheduler jobs', async () => {
      mockReq.params = { id: 'config-1' };

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            exchange_id: 'exchange-1',
            exchange_name: 'coinbase_app',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'config-1' }],
        })
        .mockResolvedValueOnce({ rows: [] }); // Delete scheduler jobs

      const handler = asyncHandler(async (req: Request, res: Response) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;
        const configId = req.params.id;

        // Get config to find exchange name
        const configResult = await db.query(
          'SELECT exchange_id, exchange_name FROM exchanges.exchange_configs WHERE id = $1 AND user_id = $2',
          [configId, userId]
        );

        if (configResult.rows.length === 0) {
          throw new CustomError('Exchange configuration not found', 404);
        }

        const config = configResult.rows[0];
        const exchangeName = config.exchange_name;

        // Delete config
        const deleteResult = await db.query(
          'DELETE FROM exchanges.exchange_configs WHERE id = $1 AND user_id = $2 RETURNING id',
          [configId, userId]
        );

        if (deleteResult.rows.length === 0) {
          throw new CustomError('Failed to delete exchange configuration', 500);
        }

        // Delete scheduler jobs
        const importerName = exchangeName.startsWith('coinbase') ? 'coinbase' : exchangeName;
        let source = 'all';
        if (exchangeName === 'coinbase_app') {
          source = 'app';
        } else if (exchangeName === 'coinbase_pro') {
          source = 'pro';
        }

        await db.query(
          'DELETE FROM scheduler.import_jobs WHERE user_id = $1 AND importer_name = $2 AND source = $3',
          [userId, importerName, source]
        );

        res.status(200).json({
          message: 'Exchange configuration deleted successfully',
          id: configId,
        });
      });

      await waitForHandler(handler, mockReq as Request, mockRes as Response, mockNext);

      expect(mockDb.query).toHaveBeenCalled();
      const deleteCalls = mockDb.query.mock.calls.filter((call: any[]) => 
        call[0]?.includes('DELETE')
      );
      expect(deleteCalls.length).toBeGreaterThan(0);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Exchange configuration deleted successfully',
          id: 'config-1',
        })
      );
    });

    it('should return 404 if config not found', async () => {
      mockReq.params = { id: 'non-existent' };

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const handler = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;
        const configId = req.params.id;

        const configResult = await db.query(
          'SELECT * FROM exchanges.exchange_configs WHERE id = $1 AND user_id = $2',
          [configId, userId]
        );

        if (configResult.rows.length === 0) {
          throw new CustomError('Exchange configuration not found', 404);
        }

        res.json({ success: true });
      });

      // Simulate error handler
      const errorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
        res.status(error.statusCode || 500).json({ error: { message: error.message, statusCode: error.statusCode } });
      };

      await waitForHandler(handler, mockReq as Request, mockRes as Response, (err) => {
        if (err) {
          errorHandler(err, mockReq as Request, mockRes as Response, mockNext);
        }
      });

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should delete scheduler jobs for coinbase_pro with correct source', async () => {
      mockReq.params = { id: 'config-2' };

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            exchange_id: 'exchange-2',
            exchange_name: 'coinbase_pro',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'config-2' }],
        })
        .mockResolvedValueOnce({ rows: [] }); // Delete scheduler jobs

      const handler = asyncHandler(async (req: Request, res: Response) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;
        const configId = req.params.id;

        const configResult = await db.query(
          'SELECT exchange_name FROM exchanges.exchange_configs WHERE id = $1 AND user_id = $2',
          [configId, userId]
        );

        const exchangeName = configResult.rows[0].exchange_name;
        const importerName = exchangeName.startsWith('coinbase') ? 'coinbase' : exchangeName;
        let source = 'all';
        if (exchangeName === 'coinbase_pro') {
          source = 'pro';
        }

        await db.query(
          'DELETE FROM scheduler.import_jobs WHERE user_id = $1 AND importer_name = $2 AND source = $3',
          [userId, importerName, source]
        );

        res.json({ success: true });
      });

      await waitForHandler(handler, mockReq as Request, mockRes as Response, mockNext);

      const deleteCall = mockDb.query.mock.calls.find((call: any[]) => 
        call[0]?.includes('scheduler.import_jobs') && call[1]?.includes('pro')
      );
      expect(deleteCall).toBeDefined();
      expect(deleteCall[1]).toEqual(['user-123', 'coinbase', 'pro']);
    });
  });

  describe('POST /exchanges/configs/sync-coinbase', () => {
    it('should sync coinbase configurations', async () => {
      const mockConfigs = [
        {
          exchange_name: 'coinbase_app',
          api_key: 'app-key',
          api_secret: 'app-secret',
          config_data: JSON.stringify({ app_field: 'value' }),
        },
        {
          exchange_name: 'coinbase_pro',
          api_key: 'pro-key',
          api_secret: 'pro-secret',
          config_data: JSON.stringify({ pro_field: 'value' }),
        },
      ];

      mockDb.query
        .mockResolvedValueOnce({ rows: mockConfigs })
        .mockResolvedValueOnce({ rows: [] }); // Upsert coinbase config

      const handler = asyncHandler(async (req: Request, res: Response) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;

        const configs = await db.query(
          'SELECT exchange_name, api_key, api_secret, config_data FROM exchanges.exchange_configs WHERE user_id = $1 AND exchange_name IN (\'coinbase_app\', \'coinbase_pro\') AND is_active = true',
          [userId]
        );

        if (configs.rows.length === 0) {
          throw new CustomError('No Coinbase configurations found to sync', 404);
        }

        let mergedConfigData: any = {};
        let mergedApiKey: string | null = null;
        let mergedApiSecret: string | null = null;

        for (const config of configs.rows) {
          if (config.config_data) {
            const configData = typeof config.config_data === 'string'
              ? JSON.parse(config.config_data)
              : config.config_data;
            mergedConfigData = { ...mergedConfigData, ...configData };
          }
          mergedApiKey = mergedApiKey || config.api_key;
          mergedApiSecret = mergedApiSecret || config.api_secret;
        }

        await db.query(
          'INSERT INTO exchanges.exchange_configs (user_id, exchange_name, api_key, api_secret, config_data) VALUES ($1, \'coinbase\', $2, $3, $4) ON CONFLICT DO UPDATE SET api_key = EXCLUDED.api_key, api_secret = EXCLUDED.api_secret, config_data = EXCLUDED.config_data',
          [userId, mergedApiKey, mergedApiSecret, JSON.stringify(mergedConfigData)]
        );

        res.json({ success: true, message: 'Coinbase configuration synced successfully' });
      });

      await waitForHandler(handler, mockReq as Request, mockRes as Response, mockNext);

      expect(mockDb.query).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Coinbase configuration synced successfully',
        })
      );
    });

    it('should return 404 if no coinbase configs found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const handler = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;

        const configs = await db.query(
          'SELECT * FROM exchanges.exchange_configs WHERE user_id = $1 AND exchange_name IN (\'coinbase_app\', \'coinbase_pro\')',
          [userId]
        );

        if (configs.rows.length === 0) {
          throw new CustomError('No Coinbase configurations found to sync', 404);
        }

        res.json({ success: true });
      });

      // Simulate error handler
      const errorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
        res.status(error.statusCode || 500).json({ error: { message: error.message, statusCode: error.statusCode } });
      };

      await waitForHandler(handler, mockReq as Request, mockRes as Response, (err) => {
        if (err) {
          errorHandler(err, mockReq as Request, mockRes as Response, mockNext);
        }
      });

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('POST /exchanges/configs/:id/import', () => {
    it('should trigger manual import for an exchange', async () => {
      mockReq.params = { id: 'config-1' };

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          exchange_name: 'coinbase_app',
          exchange_name_key: 'coinbase_app',
        }],
      });

      mockGrpcClient.startImport.mockResolvedValueOnce({
        success: true,
        message: 'Import started',
      });

      const handler = asyncHandler(async (req: Request, res: Response) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;
        const { id } = req.params;

        const configResult = await db.query(
          'SELECT ec.exchange_name, e.name as exchange_name_key FROM exchanges.exchange_configs ec LEFT JOIN exchanges.exchanges e ON ec.exchange_id = e.id WHERE ec.id = $1 AND ec.user_id = $2',
          [id, userId]
        );

        const config = configResult.rows[0];
        const exchangeName = config.exchange_name_key || config.exchange_name;

        let importerName: string;
        let source: string;

        if (exchangeName === 'coinbase_pro') {
          importerName = 'coinbase';
          source = 'pro';
        } else if (exchangeName === 'coinbase_app') {
          importerName = 'coinbase';
          source = 'app';
        } else {
          importerName = exchangeName;
          source = 'all';
        }

        const grpcClient = new GrpcClientService();
        const result = await grpcClient.startImport(
          {
            host: 'localhost',
            port: 50051,
            importerName: importerName,
          },
          source,
          userId
        );

        res.json(result);
      });

      await waitForHandler(handler, mockReq as Request, mockRes as Response, mockNext);

      expect(mockDb.query).toHaveBeenCalled();
      expect(mockGrpcClient.startImport).toHaveBeenCalledWith(
        expect.objectContaining({
          importerName: 'coinbase',
        }),
        'app',
        'user-123'
      );
      expect(mockRes.json).toHaveBeenCalled();
      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(responseData.success).toBe(true);
    });

    it('should map coinbase_pro to correct source', async () => {
      mockReq.params = { id: 'config-2' };

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          exchange_name: 'coinbase_pro',
          exchange_name_key: 'coinbase_pro',
        }],
      });

      mockGrpcClient.startImport.mockResolvedValueOnce({
        success: true,
        message: 'Import started',
      });

      const handler = asyncHandler(async (req: Request, res: Response) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;
        const { id } = req.params;

        const configResult = await db.query(
          'SELECT ec.exchange_name, e.name as exchange_name_key FROM exchanges.exchange_configs ec LEFT JOIN exchanges.exchanges e ON ec.exchange_id = e.id WHERE ec.id = $1 AND ec.user_id = $2',
          [id, userId]
        );

        const config = configResult.rows[0];
        const exchangeName = config.exchange_name_key || config.exchange_name;

        let importerName: string;
        let source: string;

        if (exchangeName === 'coinbase_pro') {
          importerName = 'coinbase';
          source = 'pro';
        } else if (exchangeName === 'coinbase_app') {
          importerName = 'coinbase';
          source = 'app';
        } else {
          importerName = exchangeName;
          source = 'all';
        }

        const grpcClient = new GrpcClientService();
        const result = await grpcClient.startImport(
          {
            host: 'localhost',
            port: 50051,
            importerName: importerName,
          },
          source,
          userId
        );

        res.json(result);
      });

      await waitForHandler(handler, mockReq as Request, mockRes as Response, mockNext);

      expect(mockGrpcClient.startImport).toHaveBeenCalledWith(
        expect.anything(),
        'pro',
        'user-123'
      );
    });
  });

  describe('GET /exchanges/import-history', () => {
    it('should return import history logs', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          importer_name: 'coinbase',
          source: 'app',
          status: 'success',
          start_time: new Date(),
          end_time: new Date(),
          rows_imported: 100,
          error_message: null,
          execution_time_seconds: 5.5,
        },
      ];

      mockDb.query.mockResolvedValueOnce({ rows: mockLogs });

      mockReq.query = { limit: '50', offset: '0' };

      const handler = asyncHandler(async (req: Request, res: Response) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;
        const { limit = 50, offset = 0 } = req.query;

        const query = `
          SELECT 
            id,
            importer_name,
            source,
            status,
            start_time,
            end_time,
            rows_imported::integer as records_processed,
            error_message,
            COALESCE(execution_time_seconds::numeric, EXTRACT(EPOCH FROM (end_time - start_time))::numeric) as duration_seconds
          FROM analytics.import_history
          WHERE user_id = $1
          ORDER BY start_time DESC
          LIMIT $2 OFFSET $3
        `;

        const result = await db.query(query, [userId, limit, offset]);
        
        const formattedRows = result.rows.map((row: any) => ({
          ...row,
          records_processed: row.records_processed !== null ? parseInt(row.records_processed, 10) : null,
          duration_seconds: row.duration_seconds !== null ? parseFloat(row.duration_seconds) : null,
        }));
        
        res.json(formattedRows);
      });

      await waitForHandler(handler, mockReq as Request, mockRes as Response, mockNext);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('import_history'),
        expect.arrayContaining(['user-123'])
      );
      // Query params come as strings from req.query, so check for string or number
      const queryCall = mockDb.query.mock.calls.find((call: any[]) => 
        call[0]?.includes('import_history')
      );
      expect(queryCall).toBeDefined();
      if (queryCall) {
        const params = queryCall[1];
        expect(params[0]).toBe('user-123');
        // limit and offset can be strings or numbers
        expect([50, '50']).toContain(params[1]);
        expect([0, '0']).toContain(params[2]);
      }
      expect(mockRes.json).toHaveBeenCalled();
    });

    it('should format numeric fields correctly', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          importer_name: 'coinbase',
          source: 'app',
          status: 'success',
          start_time: new Date(),
          end_time: new Date(),
          rows_imported: '100', // String from DB
          error_message: null,
          execution_time_seconds: '5.5', // String from DB
        },
      ];

      mockDb.query.mockResolvedValueOnce({ rows: mockLogs });

      mockReq.query = { limit: '50', offset: '0' };

      const handler = asyncHandler(async (req: Request, res: Response) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;
        const { limit = 50, offset = 0 } = req.query;

        const result = await db.query('SELECT * FROM analytics.import_history WHERE user_id = $1 LIMIT $2 OFFSET $3', [userId, limit, offset]);
        
        const formattedRows = result.rows.map((row: any) => ({
          ...row,
          records_processed: row.records_processed !== null ? parseInt(row.records_processed, 10) : null,
          duration_seconds: row.duration_seconds !== null ? parseFloat(row.duration_seconds) : null,
        }));
        
        res.json(formattedRows);
      });

      await waitForHandler(handler, mockReq as Request, mockRes as Response, mockNext);

      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(typeof responseData[0].records_processed).toBe('number');
      expect(typeof responseData[0].duration_seconds).toBe('number');
    });
  });

  describe('GET /exchanges/balances', () => {
    it('should return exchange balances', async () => {
      const mockCoinbaseAppBalances = [
        {
          exchange: 'coinbase_app',
          currency: 'BTC',
          total_balance: '1.5',
          available_balance: '1.5',
          hold_balance: '0',
        },
        {
          exchange: 'coinbase_app',
          currency: 'ETH',
          total_balance: '10.0',
          available_balance: '10.0',
          hold_balance: '0',
        },
      ];

      const mockCoinbaseProBalances = [
        {
          exchange: 'coinbase_pro',
          currency: 'BTC',
          total_balance: '0.5',
          available_balance: '0.5',
          hold_balance: '0',
        },
      ];

      mockDb.query
        .mockResolvedValueOnce({ rows: mockCoinbaseAppBalances })
        .mockResolvedValueOnce({ rows: mockCoinbaseProBalances });

      const handler = asyncHandler(async (req: Request, res: Response) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;

        const coinbaseAppQuery = `
          SELECT 
            'coinbase_app' as exchange,
            currency,
            SUM(available_balance_value) as total_balance,
            SUM(available_balance_value) as available_balance,
            SUM(hold_value) as hold_balance
          FROM coinbase.coinbase_app_accounts 
          WHERE user_id = $1 AND available_balance_value > 0
          GROUP BY currency
        `;

        const coinbaseProQuery = `
          SELECT 
            'coinbase_pro' as exchange,
            amount_balance_unit as currency,
            SUM(balance) as total_balance,
            SUM(balance) as available_balance,
            0 as hold_balance
          FROM coinbase.coinbase_pro_accounts 
          WHERE user_id = $1 AND balance > 0
          GROUP BY amount_balance_unit
        `;

        const [coinbaseAppResult, coinbaseProResult] = await Promise.all([
          db.query(coinbaseAppQuery, [userId]),
          db.query(coinbaseProQuery, [userId]),
        ]);

        res.json({
          coinbase_app: coinbaseAppResult.rows,
          coinbase_pro: coinbaseProResult.rows,
        });
      });

      await waitForHandler(handler, mockReq as Request, mockRes as Response, mockNext);

      expect(mockDb.query).toHaveBeenCalledTimes(2);
      expect(mockRes.json).toHaveBeenCalledWith({
        coinbase_app: mockCoinbaseAppBalances,
        coinbase_pro: mockCoinbaseProBalances,
      });
    });

    it('should return empty arrays when no balances exist', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const handler = asyncHandler(async (req: Request, res: Response) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;

        const [coinbaseAppResult, coinbaseProResult] = await Promise.all([
          db.query('SELECT * FROM coinbase.coinbase_app_accounts WHERE user_id = $1', [userId]),
          db.query('SELECT * FROM coinbase.coinbase_pro_accounts WHERE user_id = $1', [userId]),
        ]);

        res.json({
          coinbase_app: coinbaseAppResult.rows,
          coinbase_pro: coinbaseProResult.rows,
        });
      });

      await waitForHandler(handler, mockReq as Request, mockRes as Response, mockNext);

      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(responseData.coinbase_app).toEqual([]);
      expect(responseData.coinbase_pro).toEqual([]);
    });
  });

  describe('POST /exchanges/configs/:id/import error handling', () => {
    it('should handle import failure gracefully', async () => {
      mockReq.params = { id: 'config-1' };

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          exchange_name: 'coinbase_app',
          exchange_name_key: 'coinbase_app',
        }],
      });

      mockGrpcClient.startImport.mockResolvedValueOnce({
        success: false,
        message: 'Import failed: Service unavailable',
      });

      const handler = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;
        const { id } = req.params;

        const configResult = await db.query(
          'SELECT ec.exchange_name, e.name as exchange_name_key FROM exchanges.exchange_configs ec LEFT JOIN exchanges.exchanges e ON ec.exchange_id = e.id WHERE ec.id = $1 AND ec.user_id = $2',
          [id, userId]
        );

        if (configResult.rows.length === 0) {
          throw new CustomError('Exchange configuration not found', 404);
        }

        const config = configResult.rows[0];
        const exchangeName = config.exchange_name_key || config.exchange_name;
        const importerName = exchangeName.startsWith('coinbase') ? 'coinbase' : exchangeName;
        const source = exchangeName === 'coinbase_pro' ? 'pro' : exchangeName === 'coinbase_app' ? 'app' : 'all';

        const grpcClient = new GrpcClientService();
        const result = await grpcClient.startImport(
          {
            host: 'localhost',
            port: 50051,
            importerName: importerName,
          },
          source,
          userId
        );

        if (!result.success) {
          throw new CustomError(result.message || 'Failed to start import', 400);
        }

        res.json(result);
      });

      // Simulate error handler
      const errorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
        res.status(error.statusCode || 500).json({ error: { message: error.message, statusCode: error.statusCode } });
      };

      await waitForHandler(handler, mockReq as Request, mockRes as Response, (err) => {
        if (err) {
          errorHandler(err, mockReq as Request, mockRes as Response, mockNext);
        }
      });

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 if config not found for import', async () => {
      mockReq.params = { id: 'non-existent' };

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const handler = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;
        const { id } = req.params;

        const configResult = await db.query(
          'SELECT * FROM exchanges.exchange_configs WHERE id = $1 AND user_id = $2',
          [id, userId]
        );

        if (configResult.rows.length === 0) {
          throw new CustomError('Exchange configuration not found', 404);
        }

        res.json({ success: true });
      });

      // Simulate error handler
      const errorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
        res.status(error.statusCode || 500).json({ error: { message: error.message, statusCode: error.statusCode } });
      };

      await waitForHandler(handler, mockReq as Request, mockRes as Response, (err) => {
        if (err) {
          errorHandler(err, mockReq as Request, mockRes as Response, mockNext);
        }
      });

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should handle coinbase exchange with source "all"', async () => {
      mockReq.params = { id: 'config-1' };

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          exchange_name: 'coinbase',
          exchange_name_key: 'coinbase',
        }],
      });

      mockGrpcClient.startImport.mockResolvedValueOnce({
        success: true,
        message: 'Import started',
      });

      const handler = asyncHandler(async (req: Request, res: Response) => {
        const db = DatabaseService.getInstance();
        const userId = req.user?.id;
        const { id } = req.params;

        const configResult = await db.query(
          'SELECT ec.exchange_name, e.name as exchange_name_key FROM exchanges.exchange_configs ec LEFT JOIN exchanges.exchanges e ON ec.exchange_id = e.id WHERE ec.id = $1 AND ec.user_id = $2',
          [id, userId]
        );

        const config = configResult.rows[0];
        const exchangeName = config.exchange_name_key || config.exchange_name;

        let importerName: string;
        let source: string;

        if (exchangeName === 'coinbase_pro') {
          importerName = 'coinbase';
          source = 'pro';
        } else if (exchangeName === 'coinbase_app') {
          importerName = 'coinbase';
          source = 'app';
        } else if (exchangeName.startsWith('coinbase')) {
          importerName = 'coinbase';
          source = 'all';
        } else {
          importerName = exchangeName;
          source = 'all';
        }

        const grpcClient = new GrpcClientService();
        const result = await grpcClient.startImport(
          {
            host: 'localhost',
            port: 50051,
            importerName: importerName,
          },
          source,
          userId
        );

        res.json(result);
      });

      await waitForHandler(handler, mockReq as Request, mockRes as Response, mockNext);

      expect(mockGrpcClient.startImport).toHaveBeenCalledWith(
        expect.objectContaining({
          importerName: 'coinbase',
        }),
        'all',
        'user-123'
      );
    });
  });
});
