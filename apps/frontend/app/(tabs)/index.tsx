import { View, Text, ScrollView, ActivityIndicator } from 'react-native'
import { useState, useEffect } from 'react'
import { BalanceCard } from '../../components/BalanceCard'
import { StatCard } from '../../components/StatCard'
import { PortfolioChart, PortfolioHistory } from '../../components/PortfolioChart'
import { TopAssets } from '../../components/TopAssets'
import { portfolioApi, DailyPerformance, PortfolioSummary, HoldingsResponse } from '../../lib/api'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../context/AuthContext'

export default function DashboardScreen() {
  const { isAuthenticated } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [performance, setPerformance] = useState<DailyPerformance[]>([])
  const [holdings, setHoldings] = useState<HoldingsResponse | null>(null)

  useEffect(() => {
    if (isAuthenticated) {
      fetchDashboardData()
    }
  }, [isAuthenticated])

  const fetchDashboardData = async () => {
    setLoading(true)
    setError(null)

    try {
      const [summaryResult, performanceResult, holdingsResult] = await Promise.all([
        portfolioApi.getSummary(),
        portfolioApi.getPerformance(30),
        portfolioApi.getHoldings(),
      ])

      if (summaryResult.error) {
        setError(summaryResult.error)
      } else if (summaryResult.data) {
        setSummary(summaryResult.data)
      }

      if (performanceResult.error) {
        console.error('Performance error:', performanceResult.error)
      } else if (performanceResult.data) {
        setPerformance(performanceResult.data)
      }

      if (holdingsResult.error) {
        console.error('Holdings error:', holdingsResult.error)
      } else if (holdingsResult.data) {
        setHoldings(holdingsResult.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  // Transform performance data to PortfolioHistory format
  const portfolioHistory: PortfolioHistory[] = performance.map(item => ({
    date: item.date,
    value: item.portfolio_value_usd,
  }))

  // Transform holdings to Asset format for TopAssets
  const assets = holdings ? [
    ...(holdings.coinbase_app || []).map((holding, idx) => ({
      id: `coinbase_app_${idx}`,
      name: holding.currency,
      symbol: holding.currency,
      quantity: holding.total_balance,
      price: 0, // Price not available from holdings endpoint
      value: holding.total_balance,
      change24h: 0, // Change not available from holdings endpoint
      exchange: 'Coinbase',
    })),
    ...(holdings.coinbase_pro || []).map((holding, idx) => ({
      id: `coinbase_pro_${idx}`,
      name: holding.currency,
      symbol: holding.currency,
      quantity: holding.total_balance,
      price: 0,
      value: holding.total_balance,
      change24h: 0,
      exchange: 'Coinbase Pro',
    })),
  ] : []

  const currentValue = summary?.total_value_usd || 0
  const change24h = performance.length > 0 
    ? performance[performance.length - 1].daily_change_usd || 0
    : 0
  const change24hPercentage = performance.length > 0
    ? performance[performance.length - 1].daily_change_percentage || 0
    : 0

  if (loading) {
    return (
      <ScrollView className="flex-1 bg-slate-50">
        <View className="p-4 items-center justify-center min-h-screen">
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text className="text-slate-600 mt-4">Loading dashboard...</Text>
        </View>
      </ScrollView>
    )
  }

  if (error && !summary) {
    return (
      <ScrollView className="flex-1 bg-slate-50">
        <View className="p-4 items-center justify-center min-h-screen">
          <Text className="text-red-600 mb-4">Error: {error}</Text>
        </View>
      </ScrollView>
    )
  }

  return (
    <ScrollView className="flex-1 bg-slate-50">
      <View className="p-4 space-y-6">
        <View className="space-y-2 mb-2">
          <Text className="text-3xl font-bold text-slate-900">Dashboard</Text>
          <Text className="text-slate-600">Track your crypto assets across exchanges</Text>
        </View>

        <View className="flex-row flex-wrap gap-4">
          <View className="flex-1 min-w-[60%]">
            <BalanceCard 
              balance={currentValue}
              change24h={change24h}
              change24hPercentage={change24hPercentage}
            />
          </View>
          <View className="flex-1 min-w-[35%]">
            <StatCard
              title="Total Profit/Loss"
              value={`${summary?.total_pnl_usd && summary.total_pnl_usd >= 0 ? '+' : ''}$${Math.abs(summary?.total_pnl_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
              description={`${summary?.total_pnl_percentage && summary.total_pnl_percentage >= 0 ? '+' : ''}${(summary?.total_pnl_percentage || 0).toFixed(2)}% overall`}
              icon={(props: any) => <Ionicons name="trending-up" {...props} />}
              trend={(summary?.total_pnl_usd || 0) >= 0 ? 'up' : 'down'}
            />
          </View>
          <View className="flex-1 min-w-[35%]">
            <StatCard
              title="Total Assets"
              value={assets.length.toString()}
              description="Across all exchanges"
              icon={(props: any) => <Ionicons name="layers" {...props} />}
              trend="neutral"
            />
          </View>
        </View>

        <View className="flex-row flex-wrap gap-4">
          <View className="flex-1 min-w-[60%]">
            <PortfolioChart 
              data={portfolioHistory} 
              loading={loading}
              error={error || undefined}
            />
          </View>
          <View className="flex-1 min-w-[35%]">
            <TopAssets assets={assets} />
          </View>
        </View>
      </View>
    </ScrollView>
  )
}
