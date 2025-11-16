/**
 * Unit tests for DatabaseService
 */

import { Pool, PoolClient } from 'pg';
import { DatabaseService } from '../DatabaseService';

// Mock pg - completely mock the database
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockPool = {
  connect: jest.fn().mockResolvedValue(mockClient),
  query: jest.fn(),
  on: jest.fn(),
};

jest.mock('pg', () => {
  return {
    Pool: jest.fn(() => mockPool),
  };
});

describe('DatabaseService', () => {
  let dbService: DatabaseService;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockClient.query.mockClear();
    mockClient.release.mockClear();
    mockPool.connect.mockClear();
    mockPool.query.mockClear();
    mockPool.on.mockClear();
    
    // Reset singleton
    (DatabaseService as any).instance = undefined;
    dbService = DatabaseService.getInstance();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = DatabaseService.getInstance();
      const instance2 = DatabaseService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('initialize', () => {
    it('should initialize database connection', async () => {
      await DatabaseService.initialize();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw error if connection fails', async () => {
      mockPool.connect.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(DatabaseService.initialize()).rejects.toThrow('Connection failed');
      
      // Reset for other tests
      mockPool.connect.mockResolvedValueOnce(mockClient);
    });
  });

  describe('query', () => {
    it('should execute query successfully', async () => {
      const mockResult = {
        rows: [{ id: 1, name: 'test' }],
        rowCount: 1,
      };

      mockPool.query.mockResolvedValueOnce(mockResult);

      const result = await dbService.query('SELECT * FROM test', ['param1']);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM test', ['param1']);
      expect(result).toEqual(mockResult);
    });

    it('should log query execution time', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const mockResult = { rows: [], rowCount: 0 };

      mockPool.query.mockResolvedValueOnce(mockResult);

      await dbService.query('SELECT * FROM test');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Executed query',
        expect.objectContaining({
          text: 'SELECT * FROM test',
          duration: expect.any(Number),
          rows: 0,
        })
      );

      consoleSpy.mockRestore();
    });

    it('should handle query errors', async () => {
      const error = new Error('Query failed');
      mockPool.query.mockRejectedValueOnce(error);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(dbService.query('SELECT * FROM test')).rejects.toThrow('Query failed');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Database query error:', error);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getClient', () => {
    it('should return a client from pool', async () => {
      const client = await dbService.getClient();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(client).toBe(mockClient);
    });
  });

  describe('transaction', () => {
    it('should execute transaction successfully', async () => {
      const callback = jest.fn().mockResolvedValue('result');
      mockClient.query
        .mockResolvedValueOnce({} as any) // BEGIN
        .mockResolvedValueOnce({} as any); // COMMIT

      const result = await dbService.transaction(callback);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(callback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should rollback on error', async () => {
      const error = new Error('Transaction failed');
      const callback = jest.fn().mockRejectedValue(error);

      mockClient.query
        .mockResolvedValueOnce({} as any) // BEGIN
        .mockResolvedValueOnce({} as any); // ROLLBACK

      await expect(dbService.transaction(callback)).rejects.toThrow('Transaction failed');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});

