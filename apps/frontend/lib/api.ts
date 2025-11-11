import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'

interface ApiResponse<T> {
  data?: T
  error?: string
}

// Platform-aware storage function
async function getAuthToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem('authToken')
    } else {
      return await SecureStore.getItemAsync('authToken')
    }
  } catch (error) {
    console.error('Error getting auth token:', error)
    return null
  }
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const token = await getAuthToken()
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Request failed' }))
      return { error: errorData.message || `HTTP ${response.status}` }
    }

    const data = await response.json()
    return { data }
  } catch (error) {
    console.error('API request error:', error)
    return { error: error instanceof Error ? error.message : 'Network error' }
  }
}

export interface PortfolioSummary {
  total_value_usd: number
  total_cost_basis_usd: number
  total_pnl_usd: number
  total_pnl_percentage: number
  last_updated: string | null
}

export interface DailyPerformance {
  date: string
  portfolio_value_usd: number
  daily_change_usd: number
  daily_change_percentage: number
}

export interface Holding {
  exchange: string
  currency: string
  total_balance: number
  account_count: number
}

export interface HoldingsResponse {
  coinbase_app: Holding[]
  coinbase_pro: Holding[]
}

export interface User {
  id: string
  username: string
  email: string
  firstName?: string
  lastName?: string
  createdAt?: string
}

export interface LoginResponse {
  user: User
  token: string
}

export const authApi = {
  async login(username: string, password: string): Promise<ApiResponse<LoginResponse>> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Login failed' }))
        return { error: errorData.message || `HTTP ${response.status}` }
      }

      const data = await response.json()
      return { data }
    } catch (error) {
      console.error('Login error:', error)
      return { error: error instanceof Error ? error.message : 'Network error' }
    }
  },

  async register(username: string, email: string, password: string, firstName?: string, lastName?: string): Promise<ApiResponse<LoginResponse>> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, email, password, firstName, lastName }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Registration failed' }))
        return { error: errorData.message || `HTTP ${response.status}` }
      }

      const data = await response.json()
      return { data }
    } catch (error) {
      console.error('Registration error:', error)
      return { error: error instanceof Error ? error.message : 'Network error' }
    }
  },

  async getProfile(): Promise<ApiResponse<User>> {
    return apiRequest<User>('/api/v1/auth/profile')
  },
}

export const portfolioApi = {
  async getSummary(): Promise<ApiResponse<PortfolioSummary>> {
    return apiRequest<PortfolioSummary>('/api/v1/portfolio/summary')
  },

  async getPerformance(days: number = 30): Promise<ApiResponse<DailyPerformance[]>> {
    return apiRequest<DailyPerformance[]>(`/api/v1/portfolio/performance?days=${days}`)
  },

  async getHoldings(): Promise<ApiResponse<HoldingsResponse>> {
    return apiRequest<HoldingsResponse>('/api/v1/portfolio/holdings')
  },
}

export interface Transaction {
  exchange: string
  source: string
  transaction_id: string
  type: string
  date: string
  amount: number
  asset: string
  total_usd: number
  total_currency: string
  ingestion_time: string
}

export interface TransactionStats {
  total_transactions: number
  exchange_count: number
  asset_count: number
  total_inflow: number
  total_outflow: number
  first_transaction_date: string | null
  last_transaction_date: string | null
}

export const transactionApi = {
  async getTransactions(params?: {
    limit?: number
    offset?: number
    type?: string
    exchange?: string
    asset?: string
  }): Promise<ApiResponse<Transaction[]>> {
    const queryParams = new URLSearchParams()
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.offset) queryParams.append('offset', params.offset.toString())
    if (params?.type) queryParams.append('type', params.type)
    if (params?.exchange) queryParams.append('exchange', params.exchange)
    if (params?.asset) queryParams.append('asset', params.asset)
    
    const query = queryParams.toString()
    return apiRequest<Transaction[]>(`/api/v1/transactions${query ? `?${query}` : ''}`)
  },

  async getStats(): Promise<ApiResponse<TransactionStats>> {
    return apiRequest<TransactionStats>('/api/v1/transactions/stats')
  },
}

export interface Alert {
  id: string
  type: 'price' | 'balance' | 'transaction'
  asset: string | null
  condition: 'Above' | 'Below' | 'Equals'
  value: number
  value_currency: string
  status: 'active' | 'triggered' | 'inactive'
  triggered_at: string | null
  created_at: string
  updated_at: string
}

export const alertApi = {
  async getAlerts(status?: string): Promise<ApiResponse<Alert[]>> {
    const query = status ? `?status=${status}` : ''
    return apiRequest<Alert[]>(`/api/v1/alerts${query}`)
  },

  async getAlert(id: string): Promise<ApiResponse<Alert>> {
    return apiRequest<Alert>(`/api/v1/alerts/${id}`)
  },

  async createAlert(alert: {
    type: 'price' | 'balance' | 'transaction'
    asset?: string
    condition: 'Above' | 'Below' | 'Equals'
    value: number
    value_currency?: string
  }): Promise<ApiResponse<Alert>> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await getAuthToken() && { Authorization: `Bearer ${await getAuthToken()}` }),
        },
        body: JSON.stringify(alert),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to create alert' }))
        return { error: errorData.message || `HTTP ${response.status}` }
      }

      const data = await response.json()
      return { data }
    } catch (error) {
      console.error('Create alert error:', error)
      return { error: error instanceof Error ? error.message : 'Network error' }
    }
  },

  async updateAlert(id: string, updates: Partial<Alert>): Promise<ApiResponse<Alert>> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/alerts/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(await getAuthToken() && { Authorization: `Bearer ${await getAuthToken()}` }),
        },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to update alert' }))
        return { error: errorData.message || `HTTP ${response.status}` }
      }

      const data = await response.json()
      return { data }
    } catch (error) {
      console.error('Update alert error:', error)
      return { error: error instanceof Error ? error.message : 'Network error' }
    }
  },

  async deleteAlert(id: string): Promise<ApiResponse<void>> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/alerts/${id}`, {
        method: 'DELETE',
        headers: {
          ...(await getAuthToken() && { Authorization: `Bearer ${await getAuthToken()}` }),
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to delete alert' }))
        return { error: errorData.message || `HTTP ${response.status}` }
      }

      return { data: undefined }
    } catch (error) {
      console.error('Delete alert error:', error)
      return { error: error instanceof Error ? error.message : 'Network error' }
    }
  },
}

export interface ExchangeConnection {
  id: string
  name: string
  status: 'active' | 'inactive' | 'error'
  lastSync: string | null
  autoImport: boolean
  importSources?: Array<{
    source: string
    lastSync: string | null
    status: string
    autoImport: boolean
  }>
}

export const exchangeApi = {
  async getConfigs(): Promise<ApiResponse<ExchangeConnection[]>> {
    return apiRequest<ExchangeConnection[]>('/api/v1/exchanges/configs')
  },
}

