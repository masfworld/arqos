import { View, Text, ScrollView, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

export default function AlertsScreen() {
  return (
    <ScrollView className="flex-1 bg-slate-50">
      <View className="p-4 space-y-4">
        <View className="flex-row justify-between items-center mb-2">
          <View className="space-y-1">
            <Text className="text-3xl font-bold text-slate-900">Alerts</Text>
            <Text className="text-slate-600">Manage price and portfolio alerts</Text>
          </View>
          <TouchableOpacity className="bg-blue-600 px-4 py-2 rounded-lg flex-row items-center gap-2">
            <Ionicons name="add" size={16} color="white" />
            <Text className="text-white font-medium">Create Alert</Text>
          </TouchableOpacity>
        </View>

        <View className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm items-center justify-center min-h-[400px]">
          <Text className="text-slate-600 text-center">
            No alerts configured. Create your first alert to get started.
          </Text>
        </View>
      </View>
    </ScrollView>
  )
}
