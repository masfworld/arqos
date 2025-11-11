import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PortfolioChart } from '../components/PortfolioChart';

export function ReportsPage() {
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

        <View className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm items-center justify-center min-h-[400px]">
          <Text className="text-slate-600 text-center">
            Reports will be displayed here once you have imported transaction data.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
