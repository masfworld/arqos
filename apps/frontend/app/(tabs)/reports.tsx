import { View, Text, ScrollView, TouchableOpacity } from 'react-native'
import { useState, useEffect } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { PortfolioChart, PortfolioHistory } from '../../components/PortfolioChart'
import { portfolioApi, DailyPerformance } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'

export default function ReportsScreen() {
  const { isAuthenticated } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [performance, setPerformance] = useState<DailyPerformance[]>([])

  useEffect(() => {
    if (isAuthenticated) {
      fetchPerformanceData()
    }
  }, [isAuthenticated])

  const fetchPerformanceData = async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await portfolioApi.getPerformance(30)
      if (result.error) {
        setError(result.error)
      } else if (result.data) {
        setPerformance(result.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load performance data')
    } finally {
      setLoading(false)
    }
  }

  const portfolioHistory: PortfolioHistory[] = performance.map(item => ({
    date: item.date,
    value: item.portfolio_value_usd,
  }))

  return (
    <ScrollView className="flex-1 bg-slate-50">
      <View className="p-4 space-y-4">
        <View className="flex-row justify-between items-center mb-2">
          <View className="space-y-1">
            <Text className="text-3xl font-bold text-slate-900">Reports</Text>
            <Text className="text-slate-600">View detailed portfolio analytics and reports</Text>
          </View>
          <TouchableOpacity className="bg-slate-200 px-4 py-2 rounded-lg flex-row items-center gap-2 border border-slate-300">
            <Ionicons name="download" size={16} color="#475569" />
            <Text className="text-slate-700 font-medium">Export Report</Text>
          </TouchableOpacity>
        </View>

        <View className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <Text className="text-lg font-bold text-slate-900 mb-3">Portfolio Performance (30 Days)</Text>
          <PortfolioChart data={portfolioHistory} loading={loading} error={error || undefined} />
        </View>

        <View className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm items-center justify-center min-h-[200px]">
          <Text className="text-slate-600 text-center">
            Gains and losses report will be displayed here
          </Text>
        </View>

        <View className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm items-center justify-center min-h-[200px]">
          <Text className="text-slate-600 text-center">
            Balance history report will be displayed here
          </Text>
        </View>
      </View>
    </ScrollView>
  )
}
