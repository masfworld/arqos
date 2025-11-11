import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { DatabaseService } from '../services/DatabaseService';
import { GrpcClientService } from '../services/GrpcClientService';
import { CustomError } from '../middleware/errorHandler';
import '../middleware/auth'; // Import to ensure type declarations are available

const router = Router();
const db = DatabaseService.getInstance();
const grpcClient = new GrpcClientService();

// Get all exchange configurations for user with import history
router.get('/configs', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  
  // First get exchange configs
  const configsQuery = `
    SELECT 
      exchange_name,
      is_active,
      created_at,
      updated_at
    FROM exchanges.exchange_configs 
    WHERE user_id = $1
    ORDER BY exchange_name
  `;
  
  const configsResult = await db.query(configsQuery, [userId]);
  
  // Get import history for each exchange
  const transformed = await Promise.all(configsResult.rows.map(async (row: { exchange_name: string; is_active: boolean; created_at: Date; updated_at: Date }) => {
    const importHistoryQuery = `
      SELECT 
        source,
        MAX(start_time) as last_sync,
        (SELECT status FROM analytics.import_history 
         WHERE user_id = $1 
           AND importer_name = $2 
           AND source = ih.source 
         ORDER BY start_time DESC LIMIT 1) as status
      FROM analytics.import_history ih
      WHERE ih.user_id = $1 AND ih.importer_name = $2
      GROUP BY ih.source
    `;
    
    const importHistoryResult = await db.query(importHistoryQuery, [userId, row.exchange_name]);
    
    // Get auto-import status from scheduler
    const schedulerQuery = `
      SELECT source, enabled
      FROM scheduler.import_jobs
      WHERE user_id = $1 AND importer_name = $2 AND enabled = true
    `;
    
    const schedulerResult = await db.query(schedulerQuery, [userId, row.exchange_name]);
    const autoImportSources = new Set(schedulerResult.rows.map((r: any) => r.source));
    
    const importSources = importHistoryResult.rows.map((ih: any) => ({
      source: ih.source,
      lastSync: ih.last_sync,
      status: ih.status || 'unknown',
      autoImport: autoImportSources.has(ih.source)
    }));
    
    // Get the most recent sync time
    const lastSync = importSources.length > 0 
      ? importSources.reduce((latest: string | null, source: any) => {
          if (!latest) return source.lastSync;
          if (!source.lastSync) return latest;
          return new Date(source.lastSync) > new Date(latest) ? source.lastSync : latest;
        }, null)
      : null;
    
    return {
      id: row.exchange_name,
      name: row.exchange_name.charAt(0).toUpperCase() + row.exchange_name.slice(1),
      status: row.is_active ? 'active' : 'inactive',
      lastSync: lastSync,
      autoImport: importSources.some((s: any) => s.autoImport),
      importSources: importSources
    };
  }));
  
  res.json(transformed);
}));

// Get Coinbase App accounts
router.get('/coinbase/accounts', asyncHandler(async (req, res) => {
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
router.get('/coinbase/transactions', asyncHandler(async (req, res) => {
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

// Get Coinbase Pro accounts
router.get('/coinbase-pro/accounts', asyncHandler(async (req, res) => {
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

// Get Coinbase Pro fills
router.get('/coinbase-pro/fills', asyncHandler(async (req, res) => {
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

// Trigger manual import
router.post('/coinbase/import', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    throw new CustomError('User not authenticated', 401);
  }

  const { source = 'app' } = req.body;

  // Validate source
  const validSources = ['app', 'pro', 'all'];
  if (!validSources.includes(source)) {
    throw new CustomError(`Invalid source. Valid values: ${validSources.join(', ')}`, 400);
  }

  // Get importer config from environment
  const importerConfigs: { [key: string]: { host: string; port: number } } = {
    coinbase: {
      host: process.env.COINBASE_IMPORTER_HOST || 'localhost',
      port: parseInt(process.env.COINBASE_IMPORTER_PORT || '50051', 10),
    },
  };

  const config = importerConfigs.coinbase;
  if (!config) {
    throw new CustomError('Coinbase importer not configured', 500);
  }

  const result = await grpcClient.startImport(
    {
      host: config.host,
      port: config.port,
      importerName: 'coinbase',
    },
    source,
    userId
  );

  res.json(result);
}));

// Get exchange balances
router.get('/balances', asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  
  // Get Coinbase App balances
  const coinbaseAppQuery = `
    SELECT 
      'coinbase_app' as exchange,
      currency,
      SUM(available_balance_value) as total_balance,
      SUM(available_balance_value) as available_balance,
      SUM(hold_value) as hold_balance
    FROM coinbase.coinbase_app_accounts 
    WHERE user_id = $1 AND available_balance_value > 0
    GROUP BY currency
  `;
  
  // Get Coinbase Pro balances (using latest balance per currency)
  const coinbaseProQuery = `
    SELECT 
      'coinbase_pro' as exchange,
      amount_balance_unit as currency,
      SUM(balance) as total_balance,
      SUM(balance) as available_balance,
      0 as hold_balance
    FROM coinbase.coinbase_pro_accounts 
    WHERE user_id = $1 AND balance > 0
    GROUP BY amount_balance_unit
  `;
  
  const [coinbaseAppResult, coinbaseProResult] = await Promise.all([
    db.query(coinbaseAppQuery, [userId]),
    db.query(coinbaseProQuery, [userId])
  ]);
  
  res.json({
    coinbase_app: coinbaseAppResult.rows,
    coinbase_pro: coinbaseProResult.rows
  });
}));

export { router as exchangeRoutes };
