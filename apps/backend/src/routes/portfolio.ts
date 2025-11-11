import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { DatabaseService } from '../services/DatabaseService';
import '../middleware/auth'; // Import to ensure type declarations are available

const router = Router();
const db = DatabaseService.getInstance();

// Get portfolio summary
router.get('/summary', asyncHandler(async (req, res) => {
  const userId = req.user?.id; // Assuming user is set by auth middleware
  
  const query = `
    SELECT 
      total_value_usd,
      total_cost_basis_usd,
      total_pnl_usd,
      total_pnl_percentage,
      last_updated
    FROM portfolio.summary 
    WHERE user_id = $1
  `;
  
  const result = await db.query(query, [userId]);
  
  if (result.rows.length === 0) {
    return res.json({
      total_value_usd: 0,
      total_cost_basis_usd: 0,
      total_pnl_usd: 0,
      total_pnl_percentage: 0,
      last_updated: null
    });
  }
  
  return res.json(result.rows[0]);
}));

// Get portfolio performance over time
router.get('/performance', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { days = 30 } = req.query;
  
  const query = `
    SELECT 
      date,
      portfolio_value_usd,
      daily_change_usd,
      daily_change_percentage
    FROM analytics.daily_performance 
    WHERE user_id = $1 
      AND date >= CURRENT_DATE - INTERVAL '${days} days'
    ORDER BY date ASC
  `;
  
  const result = await db.query(query, [userId]);
  return res.json(result.rows);
}));

// Get holdings by exchange
router.get('/holdings', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  
  // Get Coinbase App holdings
  const coinbaseAppQuery = `
    SELECT 
      'coinbase_app' as exchange,
      currency,
      SUM(available_balance_value) as total_balance,
      COUNT(*) as account_count
    FROM coinbase.coinbase_app_accounts 
    WHERE user_id = $1 AND available_balance_value > 0
    GROUP BY currency
  `;
  
  // Get Coinbase Pro holdings
  const coinbaseProQuery = `
    SELECT 
      'coinbase_pro' as exchange,
      amount_balance_unit as currency,
      SUM(balance) as total_balance,
      COUNT(*) as account_count
    FROM coinbase.coinbase_pro_accounts 
    WHERE user_id = $1 AND balance > 0
    GROUP BY amount_balance_unit
  `;
  
  const [coinbaseAppResult, coinbaseProResult] = await Promise.all([
    db.query(coinbaseAppQuery, [userId]),
    db.query(coinbaseProQuery, [userId])
  ]);
  
  return res.json({
    coinbase_app: coinbaseAppResult.rows,
    coinbase_pro: coinbaseProResult.rows
  });
}));

export { router as portfolioRoutes };

