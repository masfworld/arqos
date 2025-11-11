import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { DatabaseService } from '../services/DatabaseService';
import '../middleware/auth'; // Import to ensure type declarations are available

const router = Router();
const db = DatabaseService.getInstance();

// Get unified transactions across all exchanges
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { limit = 50, offset = 0, type, exchange, asset } = req.query;
  
  let query = `
    SELECT 
      exchange,
      source,
      transaction_id,
      type,
      date,
      amount,
      asset,
      total_usd,
      total_currency,
      ingestion_time
    FROM analytics.unified_transactions 
    WHERE user_id = $1
  `;
  
  const params: any[] = [userId];
  let paramIndex = 1;
  
  if (type) {
    paramIndex++;
    query += ` AND type = $${paramIndex}`;
    params.push(type);
  }
  
  if (exchange) {
    paramIndex++;
    query += ` AND exchange = $${paramIndex}`;
    params.push(exchange);
  }
  
  if (asset) {
    paramIndex++;
    query += ` AND asset = $${paramIndex}`;
    params.push(asset);
  }
  
  paramIndex++;
  query += ` ORDER BY date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);
  
  const result = await db.query(query, params);
  res.json(result.rows);
}));

// Get transaction statistics
router.get('/stats', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  
  const query = `
    SELECT 
      COUNT(*) as total_transactions,
      COUNT(DISTINCT exchange) as exchange_count,
      COUNT(DISTINCT asset) as asset_count,
      SUM(CASE WHEN type IN ('buy', 'deposit', 'receive') THEN total_usd ELSE 0 END) as total_inflow,
      SUM(CASE WHEN type IN ('sell', 'withdrawal', 'send') THEN total_usd ELSE 0 END) as total_outflow,
      MIN(date) as first_transaction_date,
      MAX(date) as last_transaction_date
    FROM analytics.unified_transactions 
    WHERE user_id = $1
  `;
  
  const result = await db.query(query, [userId]);
  res.json(result.rows[0] || {
    total_transactions: 0,
    exchange_count: 0,
    asset_count: 0,
    total_inflow: 0,
    total_outflow: 0,
    first_transaction_date: null,
    last_transaction_date: null
  });
}));

export { router as transactionRoutes };

