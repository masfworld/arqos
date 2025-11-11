import { View, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

export interface Asset {
  id: string
  name: string
  symbol: string
  quantity: number
  price: number
  value: number
  change24h: number
  exchange: string
}

interface TopAssetsProps {
  assets: Asset[]
}

export function TopAssets({ assets }: TopAssetsProps) {
  const sortedAssets = [...assets].sort((a, b) => b.value - a.value).slice(0, 5)
  const totalValue = assets.reduce((sum, a) => sum + a.value, 0)

  if (assets.length === 0) {
    return (
      <View className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <View className="mb-3">
          <Text className="text-xl font-bold text-slate-900">Top Assets</Text>
        </View>
        <View className="items-center justify-center min-h-[200px]">
          <Text className="text-slate-600">No assets available</Text>
        </View>
      </View>
    )
  }

  return (
    <View className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
      <View className="mb-3">
        <Text className="text-xl font-bold text-slate-900">Top Assets</Text>
      </View>
      <View className="space-y-4">
        {sortedAssets.map((asset) => {
          const isPositive = asset.change24h >= 0
          const portfolioPercentage = totalValue > 0 ? (asset.value / totalValue) * 100 : 0

          return (
            <View key={asset.id} className="flex-row items-center justify-between">
              <View className="space-y-1">
                <View className="flex-row items-center space-x-2">
                  <Text className="font-semibold text-slate-900">{asset.symbol}</Text>
                  <View className="bg-slate-100 px-2 py-1 rounded text-xs">
                    <Text className="text-xs text-slate-600">{asset.exchange}</Text>
                  </View>
                </View>
                <Text className="text-sm text-slate-500">{asset.name}</Text>
              </View>
              <View className="items-end space-y-1">
                <Text className="font-semibold text-slate-900">
                  ${asset.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
                <View className="flex-row items-center space-x-1">
                  {isPositive ? (
                    <Ionicons name="trending-up" size={12} color="#22c55e" />
                  ) : (
                    <Ionicons name="trending-down" size={12} color="#ef4444" />
                  )}
                  <Text className={`text-xs ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                    {isPositive ? '+' : ''}{asset.change24h.toFixed(2)}%
                  </Text>
                  <Text className="text-xs text-slate-500">
                    ({portfolioPercentage.toFixed(1)}%)
                  </Text>
                </View>
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}