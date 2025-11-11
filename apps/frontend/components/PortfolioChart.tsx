import { View, Text, Platform, ActivityIndicator } from 'react-native'

export interface PortfolioHistory {
  date: string
  value: number
}

// Conditionally import victory based on platform
let VictoryChart: any
let VictoryLine: any
let VictoryAxis: any
let VictoryTheme: any

if (Platform.OS === 'web') {
  // Use regular victory for web
  const victory = require('victory')
  VictoryChart = victory.VictoryChart
  VictoryLine = victory.VictoryLine
  VictoryAxis = victory.VictoryAxis
  VictoryTheme = victory.VictoryTheme
} else {
  // Use victory-native for native platforms
  const victoryNative = require('victory-native')
  VictoryChart = victoryNative.VictoryChart
  VictoryLine = victoryNative.VictoryLine
  VictoryAxis = victoryNative.VictoryAxis
  VictoryTheme = victoryNative.VictoryTheme
}

interface PortfolioChartProps {
  data: PortfolioHistory[]
  loading?: boolean
  error?: string
}

export function PortfolioChart({ data, loading, error }: PortfolioChartProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  const formatValue = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`
    }
    return `$${(value / 1000).toFixed(0)}k`
  }

  const chartData = data.map(item => ({
    x: formatDate(item.date),
    y: item.value,
  }))

  if (loading) {
    return (
      <View className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <View className="mb-3">
          <Text className="text-xl font-bold text-slate-900">Portfolio Performance</Text>
        </View>
        <View className="h-[500px] items-center justify-center">
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text className="text-slate-600 mt-4">Loading chart data...</Text>
        </View>
      </View>
    )
  }

  if (error) {
    return (
      <View className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <View className="mb-3">
          <Text className="text-xl font-bold text-slate-900">Portfolio Performance</Text>
        </View>
        <View className="h-[500px] items-center justify-center">
          <Text className="text-red-600">Error loading chart: {error}</Text>
        </View>
      </View>
    )
  }

  if (!data || data.length === 0) {
    return (
      <View className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <View className="mb-3">
          <Text className="text-xl font-bold text-slate-900">Portfolio Performance</Text>
        </View>
        <View className="h-[500px] items-center justify-center">
          <Text className="text-slate-600">No data available</Text>
        </View>
      </View>
    )
  }

  return (
    <View className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
      <View className="mb-3">
        <Text className="text-xl font-bold text-slate-900">Portfolio Performance</Text>
      </View>
      <View className="h-[500px] mt-2">
        <VictoryChart
          theme={VictoryTheme.material}
          height={450}
          padding={{ left: 70, top: 30, right: 30, bottom: 60 }}
        >
          <VictoryAxis
            dependentAxis
            tickFormat={formatValue}
            style={{
              axis: { stroke: '#e2e8f0', strokeWidth: 2 },
              ticks: { stroke: '#e2e8f0', strokeWidth: 1 },
              tickLabels: { fill: '#64748b', fontSize: 14, fontWeight: 500 },
              grid: { stroke: '#f1f5f9', strokeWidth: 1 },
            }}
          />
          <VictoryAxis
            tickFormat={(t: any) => t}
            style={{
              axis: { stroke: '#e2e8f0', strokeWidth: 2 },
              ticks: { stroke: '#e2e8f0', strokeWidth: 1 },
              tickLabels: { fill: '#64748b', fontSize: 14, fontWeight: 500, angle: -45, textAnchor: 'end' },
            }}
          />
          <VictoryLine
            data={chartData}
            style={{
              data: { stroke: '#22c55e', strokeWidth: 3 },
            }}
            animate={{
              duration: 2000,
              onLoad: { duration: 1000 }
            }}
          />
        </VictoryChart>
      </View>
    </View>
  )
}
