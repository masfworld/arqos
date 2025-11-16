import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { DatabaseService } from '../../services/DatabaseService';
import '../../middleware/auth'; // Import to ensure type declarations are available

const router = Router();
const db = DatabaseService.getInstance();

// Get Coinbase App accounts
router.get('/accounts', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { limit = 100, offset = 0 } = req.query;
  
  const query = `
    SELECT 
      id,
      uuid,
      name,
      currency,
      available_balance_value,
      available_balance_currency,
      is_default,
      is_active,
      created_at,
      updated_at,
      account_type,
      is_ready,
      hold_value,
      hold_currency,
      platform,
      ingestion_time
    FROM coinbase.coinbase_app_accounts 
    WHERE user_id = $1
    ORDER BY ingestion_time DESC
    LIMIT $2 OFFSET $3
  `;
  
  const result = await db.query(query, [userId, limit, offset]);
  res.json(result.rows);
}));

// Get Coinbase App transactions
router.get('/transactions', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { limit = 50, offset = 0, type } = req.query;
  
  let query = `
    SELECT 
      id,
      transaction_id,
      transaction_type,
      created_at,
      status,
      resource,
      resource_path,
      amount_value,
      amount_currency,
      native_amount_value,
      native_amount_currency,
      advanced_trade_fill_commission,
      advanced_trade_fill_price,
      advanced_trade_fill_order_id,
      advanced_trade_fill_order_side,
      advanced_trade_fill_product_id,
      ingestion_time
    FROM coinbase.coinbase_app_transactions 
    WHERE user_id = $1
  `;
  
  const params: any[] = [userId];
  
  if (type) {
    query += ` AND transaction_type = $${params.length + 1}`;
    params.push(type);
  }
  
  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  
  const result = await db.query(query, params);
  res.json(result.rows);
}));

// Get Coinbase Pro accounts (handles both /coinbase/pro/accounts and /coinbase-pro/accounts)
router.get('/pro/accounts', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { limit = 100, offset = 0 } = req.query;
  
  const query = `
    SELECT 
      id,
      portfolio,
      type,
      time,
      amount,
      balance,
      amount_balance_unit,
      transfer_id,
      trade_id,
      order_id,
      ingestion_time
    FROM coinbase.coinbase_pro_accounts 
    WHERE user_id = $1
    ORDER BY time DESC
    LIMIT $2 OFFSET $3
  `;
  
  const result = await db.query(query, [userId, limit, offset]);
  res.json(result.rows);
}));

// Get Coinbase Pro fills (handles both /coinbase/pro/fills and /coinbase-pro/fills)
router.get('/pro/fills', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { limit = 50, offset = 0, product_id } = req.query;
  
  let query = `
    SELECT 
      id,
      portfolio,
      trade_id,
      product,
      side,
      created_at,
      size,
      size_unit,
      price,
      fee,
      total,
      price_fee_total_unit,
      ingestion_time
    FROM coinbase.coinbase_pro_fills 
    WHERE user_id = $1
  `;
  
  const params: any[] = [userId];
  
  if (product_id) {
    query += ` AND product = $${params.length + 1}`;
    params.push(product_id);
  }
  
  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  
  const result = await db.query(query, params);
  res.json(result.rows);
}));

// Trigger manual import (legacy endpoint, kept for backward compatibility)
router.post('/import', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    throw new Error('User not authenticated');
  }

  const { source = 'app' } = req.body;

  // Validate source
  const validSources = ['app', 'pro', 'all'];
  if (!validSources.includes(source)) {
    throw new Error(`Invalid source. Valid values: ${validSources.join(', ')}`);
  }

  // This endpoint is deprecated - use /api/v1/exchanges/configs/:id/import instead
  res.status(410).json({
    error: 'This endpoint is deprecated. Use POST /api/v1/exchanges/configs/:id/import instead'
  });
}));

export { router as coinbaseRoutes };

