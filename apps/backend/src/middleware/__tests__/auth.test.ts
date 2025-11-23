/**
 * Unit tests for authentication middleware
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../auth';
import { DatabaseService } from '../../services/DatabaseService';
import { CustomError } from '../errorHandler';

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('../../services/DatabaseService', () => {
  const mockDb = {
    query: jest.fn(),
  };
  return {
    DatabaseService: {
      getInstance: jest.fn(() => mockDb),
    },
  };
});

describe('Authentication Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;
  let mockDb: jest.Mocked<DatabaseService>;

  beforeEach(() => {
    mockReq = {
      headers: {},
      user: undefined,
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();

    // Create fresh mock database for each test
    mockDb = {
      query: jest.fn(),
    } as any;

    // Mock DatabaseService.getInstance
    (DatabaseService.getInstance as jest.MockedFunction<typeof DatabaseService.getInstance>) = jest.fn(() => mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticateToken', () => {
    it('should authenticate valid token and set user', async () => {
      const token = 'valid-token';
      const decoded = {
        userId: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
      };

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      (jwt.verify as jest.Mock).mockReturnValue(decoded);
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'user-123',
          email: 'test@example.com',
          username: 'testuser',
        }],
      });

      await authenticateToken(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, email, username'),
        ['user-123']
      );
      expect(mockReq.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject request without token', async () => {
      mockReq.headers = {};

      await authenticateToken(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.any(CustomError)
      );
      expect(mockReq.user).toBeUndefined();
    });

    it('should reject request with invalid token format', (done) => {
      mockReq.headers = {
        authorization: 'InvalidFormat token',
      };

      // authenticateToken wraps async function and catches errors
      authenticateToken(
        mockReq as Request,
        mockRes as Response,
        (err) => {
          expect(err).toBeInstanceOf(CustomError);
          expect((err as CustomError).statusCode).toBe(401);
          done();
        }
      );
    });

    it('should reject invalid or expired token', async () => {
      const token = 'invalid-token';
      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await authenticateToken(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.any(CustomError)
      );
      expect(mockReq.user).toBeUndefined();
    });

    it('should reject if user not found in database', (done) => {
      const token = 'valid-token';
      const decoded = {
        userId: 'user-123',
        email: 'test@example.com',
      };

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      (jwt.verify as jest.Mock).mockReturnValue(decoded);
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      authenticateToken(
        mockReq as Request,
        mockRes as Response,
        (err) => {
          expect(err).toBeInstanceOf(CustomError);
          expect((err as CustomError).statusCode).toBe(401);
          expect(mockReq.user).toBeUndefined();
          done();
        }
      );
    });

    it('should reject if user is inactive', (done) => {
      const token = 'valid-token';
      const decoded = {
        userId: 'user-123',
        email: 'test@example.com',
      };

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      (jwt.verify as jest.Mock).mockReturnValue(decoded);
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // No active user

      authenticateToken(
        mockReq as Request,
        mockRes as Response,
        (err) => {
          expect(err).toBeInstanceOf(CustomError);
          expect((err as CustomError).statusCode).toBe(401);
          done();
        }
      );
    });
  });
});

