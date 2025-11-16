import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { DatabaseService } from '../services/DatabaseService';
import { GrpcClientService } from '../services/GrpcClientService';
import { CustomError } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/auth';
import { schedulerService } from './scheduler';
import { coinbaseRoutes } from './exchanges/coinbase';

const router = Router();
const db = DatabaseService.getInstance();
const grpcClient = new GrpcClientService();

/**
 * Sync/create the 'coinbase' config entry from coinbase_app/coinbase_pro configs
 * This is needed because the Python importer looks for exchange_name = 'coinbase'
 */
async function syncCoinbaseConfig(
  userId: string,
  apiKey: string | null,
  apiSecret: string | null,
  newConfigData: any
): Promise<void> {
  // Get all existing Coinbase configs (coinbase, coinbase_app, coinbase_pro)
  const existingConfigsQuery = `
    SELECT exchange_name, api_key, api_secret, config_data
    FROM exchanges.exchange_configs
    WHERE user_id = $1 
      AND exchange_name IN ('coinbase', 'coinbase_app', 'coinbase_pro')
      AND is_active = true
    ORDER BY 
      CASE exchange_name
        WHEN 'coinbase' THEN 1
        WHEN 'coinbase_app' THEN 2
        WHEN 'coinbase_pro' THEN 3
      END
  `;
  
  const existingConfigs = await db.query(existingConfigsQuery, [userId]);
  
  // Merge config_data from all sources
  let mergedConfigData: any = {};
  let mergedApiKey = apiKey;
  let mergedApiSecret = apiSecret;
  
  // Start with existing 'coinbase' config if it exists
  const existingCoinbase = existingConfigs.rows.find((r: any) => r.exchange_name === 'coinbase');
  if (existingCoinbase) {
    if (existingCoinbase.config_data) {
      mergedConfigData = typeof existingCoinbase.config_data === 'string'
        ? JSON.parse(existingCoinbase.config_data)
        : existingCoinbase.config_data;
    }
    mergedApiKey = mergedApiKey || existingCoinbase.api_key;
    mergedApiSecret = mergedApiSecret || existingCoinbase.api_secret;
  }
  
  // Merge with coinbase_app config
  const coinbaseApp = existingConfigs.rows.find((r: any) => r.exchange_name === 'coinbase_app');
  if (coinbaseApp && coinbaseApp.config_data) {
    const appConfig = typeof coinbaseApp.config_data === 'string'
      ? JSON.parse(coinbaseApp.config_data)
      : coinbaseApp.config_data;
    mergedConfigData = { ...mergedConfigData, ...appConfig };
    mergedApiKey = mergedApiKey || coinbaseApp.api_key;
    mergedApiSecret = mergedApiSecret || coinbaseApp.api_secret;
  }
  
  // Merge with coinbase_pro config
  const coinbasePro = existingConfigs.rows.find((r: any) => r.exchange_name === 'coinbase_pro');
  if (coinbasePro && coinbasePro.config_data) {
    const proConfig = typeof coinbasePro.config_data === 'string'
      ? JSON.parse(coinbasePro.config_data)
      : coinbasePro.config_data;
    mergedConfigData = { ...mergedConfigData, ...proConfig };
    mergedApiKey = mergedApiKey || coinbasePro.api_key;
    mergedApiSecret = mergedApiSecret || coinbasePro.api_secret;
  }
  
  // Merge with new config data (takes precedence)
  mergedConfigData = { ...mergedConfigData, ...newConfigData };
  
  // Create/update the 'coinbase' entry
  const coinbaseUpsertQuery = `
    INSERT INTO exchanges.exchange_configs 
      (user_id, exchange_name, api_key, api_secret, config_data, is_active)
    VALUES ($1, 'coinbase', $2, $3, $4::jsonb, true)
    ON CONFLICT (user_id, exchange_name)
    DO UPDATE SET
      api_key = COALESCE(EXCLUDED.api_key, exchanges.exchange_configs.api_key),
      api_secret = COALESCE(EXCLUDED.api_secret, exchanges.exchange_configs.api_secret),
      config_data = EXCLUDED.config_data,
      is_active = EXCLUDED.is_active,
      updated_at = CURRENT_TIMESTAMP
  `;
  
  await db.query(coinbaseUpsertQuery, [
    userId,
    mergedApiKey,
    mergedApiSecret,
    JSON.stringify(mergedConfigData)
  ]);
}

// Get all available exchanges
router.get('/', asyncHandler(async (req, res) => {
  const query = `
    SELECT 
      id,
      name,
      display_name,
      config_parameters,
      description,
      is_active
    FROM exchanges.exchanges
    WHERE is_active = true
    ORDER BY display_name
  `;
  
  const result = await db.query(query);
  res.json(result.rows);
}));

// Get all exchange configurations for user with import history
router.get('/configs', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  
  // First get exchange configs with exchange details
  const configsQuery = `
    SELECT 
      ec.id,
      ec.exchange_id,
      ec.exchange_name,
      ec.is_active,
      ec.created_at,
      ec.updated_at,
      e.name as exchange_name_key,
      e.display_name
    FROM exchanges.exchange_configs ec
    LEFT JOIN exchanges.exchanges e ON ec.exchange_id = e.id
    WHERE ec.user_id = $1
    ORDER BY COALESCE(e.display_name, ec.exchange_name)
  `;
  
  const configsResult = await db.query(configsQuery, [userId]);
  
  // Get import history for each exchange
  const transformed = await Promise.all(configsResult.rows.map(async (row: { 
    id: string;
    exchange_id: string | null;
    exchange_name: string; 
    exchange_name_key: string | null;
    display_name: string | null;
    is_active: boolean; 
    created_at: Date; 
    updated_at: Date 
  }) => {
    const exchangeName = row.exchange_name_key || row.exchange_name;
    const displayName = row.display_name || row.exchange_name.charAt(0).toUpperCase() + row.exchange_name.slice(1);
    
    // Map exchange name to importer name and source filter
    let importerName: string;
    let sourceFilter: string | null = null; // Filter by source for this specific exchange
    
    if (exchangeName === 'coinbase_pro') {
      importerName = 'coinbase';
      sourceFilter = 'pro';
    } else if (exchangeName === 'coinbase_app') {
      importerName = 'coinbase';
      sourceFilter = 'app';
    } else {
      importerName = exchangeName;
      sourceFilter = null; // No filter for other exchanges
    }
    
    // Build query with optional source filter
    let importHistoryQuery = `
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
    `;
    
    const queryParams: any[] = [userId, importerName];
    
    if (sourceFilter) {
      importHistoryQuery += ` AND ih.source = $3`;
      queryParams.push(sourceFilter);
    }
    
    importHistoryQuery += ` GROUP BY ih.source`;
    
    const importHistoryResult = await db.query(importHistoryQuery, queryParams);
    
    // Get auto-import status from scheduler (also filtered by source if applicable)
    let schedulerQuery = `
      SELECT source, enabled
      FROM scheduler.import_jobs
      WHERE user_id = $1 AND importer_name = $2 AND enabled = true
    `;
    
    const schedulerParams: any[] = [userId, importerName];
    if (sourceFilter) {
      schedulerQuery += ` AND source = $3`;
      schedulerParams.push(sourceFilter);
    }
    
    const schedulerResult = await db.query(schedulerQuery, schedulerParams);
    const autoImportSources = new Set(schedulerResult.rows.map((r: any) => r.source));
    
    // Coinbase Pro does not support auto-import (only manual)
    const exchangesWithoutAutoImport = ['coinbase_pro'];
    const supportsAutoImport = !exchangesWithoutAutoImport.includes(exchangeName);
    
    const importSources = importHistoryResult.rows.map((ih: any) => ({
      source: ih.source,
      lastSync: ih.last_sync,
      status: ih.status || 'unknown',
      autoImport: supportsAutoImport && autoImportSources.has(ih.source)
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
      id: row.id,
      exchangeId: row.exchange_id,
      name: displayName,
      exchangeName: exchangeName, // Add the actual exchange name for mapping
      status: row.is_active ? 'active' : 'inactive',
      lastSync: lastSync,
      autoImport: supportsAutoImport && importSources.some((s: any) => s.autoImport),
      importSources: importSources
    };
  }));
  
  res.json(transformed);
}));

// Create exchange configuration
router.post('/configs', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    throw new CustomError('User not authenticated', 401);
  }

  const { exchange_id, config_data } = req.body;

  if (!exchange_id) {
    throw new CustomError('exchange_id is required', 400);
  }

  // Get exchange details
  const exchangeQuery = `
    SELECT id, name, display_name, config_parameters
    FROM exchanges.exchanges
    WHERE id = $1 AND is_active = true
  `;
  
  const exchangeResult = await db.query(exchangeQuery, [exchange_id]);
  
  if (exchangeResult.rows.length === 0) {
    throw new CustomError('Exchange not found or inactive', 404);
  }

  const exchange = exchangeResult.rows[0] as {
    id: string;
    name: string;
    display_name: string | null;
    config_parameters: any;
  };
  
  // Validate config_data against config_parameters
  const configParameters = exchange.config_parameters as Array<{
    name: string;
    required?: boolean;
    type?: string;
  }>;
  
  if (configParameters && Array.isArray(configParameters)) {
    for (const param of configParameters) {
      if (param.required && (!config_data || !config_data[param.name])) {
        throw new CustomError(`Missing required parameter: ${param.name}`, 400);
      }
    }
  }

  // Extract api_key and api_secret if present
  const api_key = config_data?.api_key || config_data?.coinbase_api_key || null;
  const api_secret = config_data?.api_secret || config_data?.coinbase_api_secret || null;

  // Prepare config_data JSONB (exclude api_key and api_secret as they're stored separately)
  const configDataJson: any = { ...config_data };
  if (configDataJson.api_key) delete configDataJson.api_key;
  if (configDataJson.api_secret) delete configDataJson.api_secret;
  if (configDataJson.coinbase_api_key) delete configDataJson.coinbase_api_key;
  if (configDataJson.coinbase_api_secret) delete configDataJson.coinbase_api_secret;

  // Insert or update exchange config
  const upsertQuery = `
    INSERT INTO exchanges.exchange_configs 
      (user_id, exchange_id, exchange_name, api_key, api_secret, config_data, is_active)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, true)
    ON CONFLICT (user_id, exchange_id)
    DO UPDATE SET
      api_key = EXCLUDED.api_key,
      api_secret = EXCLUDED.api_secret,
      config_data = EXCLUDED.config_data,
      is_active = EXCLUDED.is_active,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, exchange_id, exchange_name, is_active, created_at, updated_at
  `;
  
  const result = await db.query(upsertQuery, [
    userId,
    exchange_id,
    exchange.name,
    api_key,
    api_secret,
    JSON.stringify(configDataJson)
  ]);

  // For Coinbase exchanges, also create/update a 'coinbase' entry that the importer can find
  // The importer looks for exchange_name = 'coinbase'
  if (exchange.name.startsWith('coinbase')) {
    await syncCoinbaseConfig(userId, api_key, api_secret, configDataJson);
  }

  // Automatically create hourly sync job for this exchange if it doesn't exist
  // Skip automatic import for exchanges that don't support it (e.g., coinbase_pro)
  const exchangesWithoutAutoImport = ['coinbase_pro'];
  
  if (!exchangesWithoutAutoImport.includes(exchange.name)) {
    // Map exchange name to importer name (coinbase_app -> coinbase)
    const importerName: string = exchange.name.startsWith('coinbase') ? 'coinbase' : exchange.name;
    
    // Determine source based on exchange type
    let source: string = 'all';
    if (exchange.name === 'coinbase_app') {
      source = 'app';
    }

    try {
      // Check if job already exists
      const existingJob = await db.query(
        'SELECT id FROM scheduler.import_jobs WHERE user_id = $1 AND importer_name = $2 AND source = $3',
        [userId, importerName, source]
      );

      if (existingJob.rows.length === 0) {
        // Create hourly job (runs at minute 0 of every hour: "0 * * * *")
        const description = `Automatic hourly sync for ${exchange.display_name || exchange.name}`;
        await schedulerService.createJob(
          userId,
          importerName,
          source,
          '0 * * * *', // Every hour at minute 0
          description
        );
        console.log(`Created automatic hourly sync job for ${exchange.display_name || exchange.name}`);
      }
    } catch (schedulerError) {
      // Log error but don't fail the config creation
      console.error('Failed to create automatic sync job:', schedulerError);
    }
  } else {
    console.log(`Skipping automatic import job creation for ${exchange.display_name || exchange.name} (not supported)`);
  }

  res.status(201).json({
    id: result.rows[0].id,
    exchange_id: result.rows[0].exchange_id,
    exchange_name: result.rows[0].exchange_name,
    is_active: result.rows[0].is_active,
    created_at: result.rows[0].created_at,
    updated_at: result.rows[0].updated_at
  });
}));

// Sync Coinbase configuration (creates/updates 'coinbase' entry from coinbase_app/coinbase_pro)
router.post('/configs/sync-coinbase', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    throw new CustomError('User not authenticated', 401);
  }

  // Get all Coinbase configs to merge
  const configsQuery = `
    SELECT exchange_name, api_key, api_secret, config_data
    FROM exchanges.exchange_configs
    WHERE user_id = $1 
      AND exchange_name IN ('coinbase_app', 'coinbase_pro')
      AND is_active = true
  `;
  
  const configs = await db.query(configsQuery, [userId]);
  
  if (configs.rows.length === 0) {
    throw new CustomError('No Coinbase configurations found to sync', 404);
  }

  // Merge all configs
  let mergedConfigData: any = {};
  let mergedApiKey: string | null = null;
  let mergedApiSecret: string | null = null;

  for (const config of configs.rows) {
    if (config.config_data) {
      const configData = typeof config.config_data === 'string'
        ? JSON.parse(config.config_data)
        : config.config_data;
      mergedConfigData = { ...mergedConfigData, ...configData };
    }
    mergedApiKey = mergedApiKey || config.api_key;
    mergedApiSecret = mergedApiSecret || config.api_secret;
  }

  await syncCoinbaseConfig(userId, mergedApiKey, mergedApiSecret, mergedConfigData);

  res.json({ success: true, message: 'Coinbase configuration synced successfully' });
}));

// Get import history logs for user
router.get('/import-history', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { limit = 50, offset = 0 } = req.query;

  const query = `
    SELECT 
      id,
      importer_name,
      source,
      status,
      start_time,
      end_time,
      rows_imported::integer as records_processed,
      error_message,
      COALESCE(execution_time_seconds::numeric, EXTRACT(EPOCH FROM (end_time - start_time))::numeric) as duration_seconds
    FROM analytics.import_history
    WHERE user_id = $1
    ORDER BY start_time DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await db.query(query, [userId, limit, offset]);
  
  // Ensure numeric fields are properly typed
  const formattedRows = result.rows.map((row: any) => ({
    ...row,
    records_processed: row.records_processed !== null ? parseInt(row.records_processed, 10) : null,
    duration_seconds: row.duration_seconds !== null ? parseFloat(row.duration_seconds) : null,
  }));
  
  res.json(formattedRows);
}));

// Mount Coinbase-specific routes
router.use('/coinbase', coinbaseRoutes);
router.use('/coinbase-pro', coinbaseRoutes); // Backward compatibility

// Trigger manual import for an exchange config
router.post('/configs/:id/import', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    throw new CustomError('User not authenticated', 401);
  }

  const { id } = req.params;

  // Get exchange config
  const configQuery = `
    SELECT 
      ec.exchange_name,
      e.name as exchange_name_key
    FROM exchanges.exchange_configs ec
    LEFT JOIN exchanges.exchanges e ON ec.exchange_id = e.id
    WHERE ec.id = $1 AND ec.user_id = $2
  `;

  const configResult = await db.query(configQuery, [id, userId]);

  if (configResult.rows.length === 0) {
    throw new CustomError('Exchange configuration not found', 404);
  }

  const config = configResult.rows[0];
  const exchangeName = config.exchange_name_key || config.exchange_name;

  // Map exchange name to importer name and source
  let importerName: string;
  let source: string;

  if (exchangeName === 'coinbase_pro') {
    importerName = 'coinbase';
    source = 'pro';
  } else if (exchangeName === 'coinbase_app') {
    importerName = 'coinbase';
    source = 'app';
  } else if (exchangeName.startsWith('coinbase')) {
    importerName = 'coinbase';
    source = 'all';
  } else {
    importerName = exchangeName;
    source = 'all';
  }

  // Get importer config from environment
  const importerConfigs: { [key: string]: { host: string; port: number } } = {
    coinbase: {
      host: process.env.COINBASE_IMPORTER_HOST || 'localhost',
      port: parseInt(process.env.COINBASE_IMPORTER_PORT || '50051', 10),
    },
  };

  const importerConfig = importerConfigs[importerName];
  if (!importerConfig) {
    throw new CustomError(`Importer ${importerName} not configured`, 500);
  }

  const result = await grpcClient.startImport(
    {
      host: importerConfig.host,
      port: importerConfig.port,
      importerName: importerName,
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
