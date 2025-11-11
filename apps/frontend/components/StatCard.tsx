import { View, Text } from 'react-native'

interface StatCardProps {
  title: string
  value: string
  description?: string
  icon: any
  trend?: 'up' | 'down' | 'neutral'
}

export function StatCard({ title, value, description, icon: Icon, trend = 'neutral' }: StatCardProps) {
  const getTrendColor = () => {
    if (trend === 'up') return 'text-green-500'
    if (trend === 'down') return 'text-red-500'
    return 'text-slate-600'
  }

  return (
    <View className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-medium text-slate-600">{title}</Text>
        <Icon size={16} color="#64748b" />
      </View>
      <View className="space-y-1">
        <Text className={`text-2xl font-bold ${getTrendColor()}`}>{value}</Text>
        {description && (
          <Text className="text-xs text-slate-500">{description}</Text>
        )}
      </View>
    </View>
  )
}