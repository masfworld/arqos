// Shared types for Arqos applications

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface PortfolioSummary {
  total_value_usd: number;
  total_cost_basis_usd: number;
  total_pnl_usd: number;
  total_pnl_percentage: number;
  last_updated: string;
}

export interface DailyPerformance {
  date: string;
  portfolio_value_usd: number;
  daily_change_usd: number;
  daily_change_percentage: number;
}

export interface ExchangeConfig {
  exchange_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CoinbaseTransaction {
  transaction_id: string;
  account_id: string;
  transaction_type: string;
  amount: number;
  currency: string;
  native_amount: number;
  native_currency: string;
  description: string;
  transaction_date: string;
}

export interface CoinbaseProFill {
  fill_id: string;
  order_id: string;
  product_id: string;
  side: string;
  size: number;
  price: number;
  fee: number;
  settled: boolean;
  usd_volume: number;
  created_at: string;
}

export interface ExchangeBalance {
  exchange: string;
  currency: string;
  total_balance: number;
  available_balance: number;
  hold_balance: number;
}

export interface ApiError {
  error: {
    message: string;
    statusCode: number;
    timestamp: string;
    path: string;
    method: string;
  };
}
