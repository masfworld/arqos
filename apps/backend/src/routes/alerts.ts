import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { CustomError } from '../middleware/errorHandler';
import { DatabaseService } from '../services/DatabaseService';
import '../middleware/auth'; // Import to ensure type declarations are available

const router = Router();
const db = DatabaseService.getInstance();

// Get all alerts for user
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { status } = req.query;
  
  let query = `
    SELECT 
      id,
      type,
      asset,
      condition,
      value,
      value_currency,
      status,
      triggered_at,
      created_at,
      updated_at
    FROM analytics.alerts 
    WHERE user_id = $1
  `;
  
  const params: any[] = [userId];
  
  if (status) {
    query += ` AND status = $2`;
    params.push(status);
  }
  
  query += ` ORDER BY created_at DESC`;
  
  const result = await db.query(query, params);
  res.json(result.rows);
}));

// Get single alert
router.get('/:id', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { id } = req.params;
  
  const query = `
    SELECT 
      id,
      type,
      asset,
      condition,
      value,
      value_currency,
      status,
      triggered_at,
      created_at,
      updated_at
    FROM analytics.alerts 
    WHERE id = $1 AND user_id = $2
  `;
  
  const result = await db.query(query, [id, userId]);
  
  if (result.rows.length === 0) {
    throw new CustomError('Alert not found', 404);
  }
  
  res.json(result.rows[0]);
}));

// Create new alert
router.post('/', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { type, asset, condition, value, value_currency } = req.body;
  
  if (!type || !condition || value === undefined) {
    throw new CustomError('Type, condition, and value are required', 400);
  }
  
  const validTypes = ['price', 'balance', 'transaction'];
  if (!validTypes.includes(type)) {
    throw new CustomError(`Invalid type. Valid values: ${validTypes.join(', ')}`, 400);
  }
  
  const validConditions = ['Above', 'Below', 'Equals'];
  if (!validConditions.includes(condition)) {
    throw new CustomError(`Invalid condition. Valid values: ${validConditions.join(', ')}`, 400);
  }
  
  const query = `
    INSERT INTO analytics.alerts (user_id, type, asset, condition, value, value_currency, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'active')
    RETURNING 
      id,
      type,
      asset,
      condition,
      value,
      value_currency,
      status,
      triggered_at,
      created_at,
      updated_at
  `;
  
  const result = await db.query(query, [
    userId,
    type,
    asset || null,
    condition,
    value,
    value_currency || 'USD'
  ]);
  
  res.status(201).json(result.rows[0]);
}));

// Update alert
router.put('/:id', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { id } = req.params;
  const { type, asset, condition, value, value_currency, status } = req.body;
  
  // Check if alert exists and belongs to user
  const checkQuery = 'SELECT id FROM analytics.alerts WHERE id = $1 AND user_id = $2';
  const checkResult = await db.query(checkQuery, [id, userId]);
  
  if (checkResult.rows.length === 0) {
    throw new CustomError('Alert not found', 404);
  }
  
  // Build update query dynamically
  const updates: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;
  
  if (type !== undefined) {
    paramIndex++;
    updates.push(`type = $${paramIndex}`);
    params.push(type);
  }
  
  if (asset !== undefined) {
    paramIndex++;
    updates.push(`asset = $${paramIndex}`);
    params.push(asset);
  }
  
  if (condition !== undefined) {
    paramIndex++;
    updates.push(`condition = $${paramIndex}`);
    params.push(condition);
  }
  
  if (value !== undefined) {
    paramIndex++;
    updates.push(`value = $${paramIndex}`);
    params.push(value);
  }
  
  if (value_currency !== undefined) {
    paramIndex++;
    updates.push(`value_currency = $${paramIndex}`);
    params.push(value_currency);
  }
  
  if (status !== undefined) {
    paramIndex++;
    updates.push(`status = $${paramIndex}`);
    params.push(status);
  }
  
  if (updates.length === 0) {
    throw new CustomError('No fields to update', 400);
  }
  
  params.push(id, userId);
  
  const query = `
    UPDATE analytics.alerts 
    SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = $${paramIndex + 1} AND user_id = $${paramIndex + 2}
    RETURNING 
      id,
      type,
      asset,
      condition,
      value,
      value_currency,
      status,
      triggered_at,
      created_at,
      updated_at
  `;
  
  const result = await db.query(query, params);
  res.json(result.rows[0]);
}));

// Delete alert
router.delete('/:id', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { id } = req.params;
  
  const query = 'DELETE FROM analytics.alerts WHERE id = $1 AND user_id = $2 RETURNING id';
  const result = await db.query(query, [id, userId]);
  
  if (result.rows.length === 0) {
    throw new CustomError('Alert not found', 404);
  }
  
  res.status(204).send();
}));

export { router as alertRoutes };

