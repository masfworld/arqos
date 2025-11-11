/**
 * Authentication Middleware
 * Validates JWT tokens and sets req.user
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { CustomError } from './errorHandler';

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

export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    throw new CustomError('Authentication token required', 401);
  }

  const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';

  try {
    const decoded = jwt.verify(token, jwtSecret) as { userId: string; email: string; username?: string };
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      username: decoded.username,
    };
    next();
  } catch (error) {
    throw new CustomError('Invalid or expired token', 401);
  }
};

