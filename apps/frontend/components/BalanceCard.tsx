import { View, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

interface BalanceCardProps {
  balance: number
  change24h: number
  change24hPercentage: number
}

export function BalanceCard({ balance, change24h, change24hPercentage }: BalanceCardProps) {
  const isPositive = change24h >= 0

  return (
    <View className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
      <View className="mb-3">
        <Text className="text-sm font-medium text-slate-600">
          Total Portfolio Value
        </Text>
      </View>
      <View className="space-y-2">
        <Text className="text-3xl font-bold text-slate-900">
          ${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
        <View className="flex-row items-center space-x-2">
          {isPositive ? (
            <Ionicons name="trending-up" size={16} color="#22c55e" />
          ) : (
            <Ionicons name="trending-down" size={16} color="#ef4444" />
          )}
          <Text className={`text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? '+' : ''}${change24h.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {' '}({isPositive ? '+' : ''}{change24hPercentage.toFixed(2)}%)
          </Text>
          <Text className="text-sm text-slate-500">24h</Text>
        </View>
      </View>
    </View>
  )
}