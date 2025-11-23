/**
 * Authentication Middleware
 * Validates JWT tokens and sets req.user
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { CustomError } from './errorHandler';
import { DatabaseService } from '../services/DatabaseService';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        username?: string;
      };
    }
  }
}

const authenticateTokenAsync = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    throw new CustomError('Authentication token required', 401);
  }

  const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';

  try {
    const decoded = jwt.verify(token, jwtSecret) as { userId: string; email: string; username?: string };
    
    // Verify user still exists in database
    const db = DatabaseService.getInstance();
    const userCheck = await db.query(
      'SELECT id, email, username FROM auth.users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );

    if (userCheck.rows.length === 0) {
      throw new CustomError('User not found or inactive', 401);
    }

    req.user = {
      id: userCheck.rows[0].id,
      email: userCheck.rows[0].email,
      username: userCheck.rows[0].username,
    };
    next();
  } catch (error) {
    if (error instanceof CustomError) {
      throw error;
    }
    throw new CustomError('Invalid or expired token', 401);
  }
};

// Wrap async middleware for Express
export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  Promise.resolve(authenticateTokenAsync(req, res, next)).catch(next);
};

