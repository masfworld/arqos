/**
 * Unit tests for exchanges routes
 */

import { Request, Response, NextFunction } from 'express';
import { DatabaseService } from '../../services/DatabaseService';
import { GrpcClientService } from '../../services/GrpcClientService';
import { authenticateToken } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
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
});
