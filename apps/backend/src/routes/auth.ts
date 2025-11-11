import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { CustomError } from '../middleware/errorHandler';
import { DatabaseService } from '../services/DatabaseService';
import '../middleware/auth'; // Import to ensure type declarations are available
import jwt from 'jsonwebtoken';

const router = Router();
const db = DatabaseService.getInstance();

// Register new user
router.post('/register', asyncHandler(async (req, res) => {
  const { username, email, password, firstName, lastName } = req.body;
  
  if (!username || !email || !password) {
    throw new CustomError('Username, email and password are required', 400);
  }
  
  // Check if user already exists (by username or email)
  const existingUser = await db.query(
    'SELECT id FROM auth.users WHERE username = $1 OR email = $2',
    [username, email]
  );
  
  if (existingUser.rows.length > 0) {
    throw new CustomError('User already exists', 409);
  }
  
  // Hash password using PostgreSQL crypt function (consistent with init.sql)
  const result = await db.query(
    `INSERT INTO auth.users (username, email, password_hash, first_name, last_name) 
     VALUES ($1, $2, crypt($3, gen_salt('bf')), $4, $5) 
     RETURNING id, username, email, first_name, last_name, created_at`,
    [username, email, password, firstName || null, lastName || null]
  );
  
  const user = result.rows[0];
  
  // Generate JWT token
  const token = jwt.sign(
    { userId: user.id, email: user.email, username: user.username },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );
  
  res.status(201).json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      createdAt: user.created_at
    },
    token
  });
}));

// Login user (supports username or email)
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    throw new CustomError('Username and password are required', 400);
  }
  
  // Find user by username or email
  const result = await db.query(
    `SELECT id, username, email, password_hash, first_name, last_name 
     FROM auth.users 
     WHERE (username = $1 OR email = $1) AND is_active = true`,
    [username]
  );
  
  if (result.rows.length === 0) {
    throw new CustomError('Invalid credentials', 401);
  }
  
  const user = result.rows[0];
  
  // Verify password using PostgreSQL crypt function (works with pgcrypto-generated hashes)
  const passwordCheck = await db.query(
    'SELECT (password_hash = crypt($1, password_hash)) AS password_match FROM auth.users WHERE id = $2',
    [password, user.id]
  );
  
  if (!passwordCheck.rows[0]?.password_match) {
    throw new CustomError('Invalid credentials', 401);
  }
  
  // Generate JWT token
  const token = jwt.sign(
    { userId: user.id, email: user.email, username: user.username },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );
  
  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name
    },
    token
  });
}));

// Get current user profile
router.get('/profile', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  
  const result = await db.query(
    'SELECT id, username, email, first_name, last_name, created_at FROM auth.users WHERE id = $1',
    [userId]
  );
  
  if (result.rows.length === 0) {
    throw new CustomError('User not found', 404);
  }
  
  const user = result.rows[0];
  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    createdAt: user.created_at
  });
}));

export { router as authRoutes };

