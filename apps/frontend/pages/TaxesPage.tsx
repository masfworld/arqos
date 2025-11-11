import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function TaxesPage() {
  return (
    <View className="space-y-6 p-4">
      <View>
        <Text className="text-3xl font-bold text-slate-900">Tax Calculator</Text>
        <Text className="text-slate-600 mt-1">Calculate taxes for your crypto transactions</Text>
      </View>

      <View className="flex-row flex-wrap gap-4">
        <View className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm flex-1 min-w-[30%]">
          <View className="mb-3">
            <Text className="text-sm font-medium text-slate-700">Capital Gains</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Ionicons name="trending-up" size={16} color="#22c55e" />
            <Text className="text-2xl font-bold text-green-600">$24,532.00</Text>
          </View>
        </View>
        <View className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm flex-1 min-w-[30%]">
          <View className="mb-3">
            <Text className="text-sm font-medium text-slate-700">Capital Losses</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Ionicons name="trending-down" size={16} color="#ef4444" />
            <Text className="text-2xl font-bold text-red-600">$3,241.50</Text>
          </View>
        </View>
        <View className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm flex-1 min-w-[30%]">
          <View className="mb-3">
            <Text className="text-sm font-medium text-slate-700">Estimated Tax</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Ionicons name="calculator" size={16} color="#64748b" />
            <Text className="text-2xl font-bold text-slate-900">$6,387.13</Text>
          </View>
        </View>
      </View>

      <View className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <Text className="text-lg font-bold text-slate-900 mb-3">Tax Year Settings</Text>
        <View className="space-y-4">
          <View className="flex-row flex-wrap gap-4">
            <View className="flex-1 min-w-[45%] space-y-2">
              <Text className="text-sm font-medium text-slate-700">Tax Year</Text>
              <View className="h-10 px-3 rounded-lg border border-slate-200 bg-white justify-center">
                <Text className="text-slate-900">2024</Text>
              </View>
            </View>
            <View className="flex-1 min-w-[45%] space-y-2">
              <Text className="text-sm font-medium text-slate-700">Country</Text>
              <View className="h-10 px-3 rounded-lg border border-slate-200 bg-white justify-center">
                <Text className="text-slate-900">United States</Text>
              </View>
            </View>
          </View>
          <View className="flex-row gap-2">
            <TouchableOpacity className="bg-blue-600 px-4 py-2 rounded-lg flex-row items-center gap-2 flex-1 justify-center">
              <Ionicons name="calculator" size={16} color="white" />
              <Text className="text-white font-medium">Calculate Taxes</Text>
            </TouchableOpacity>
            <TouchableOpacity className="bg-slate-100 px-4 py-2 rounded-lg border border-slate-300 flex-row items-center gap-2 flex-1 justify-center">
              <Ionicons name="document-text" size={16} color="#475569" />
              <Text className="text-slate-700 font-medium">Export Report</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <Text className="text-lg font-bold text-slate-900 mb-3">Taxable Events (2024)</Text>
        <View className="p-6">
          <Text className="text-sm text-slate-600 text-center py-8">
            No taxable events calculated yet. Click "Calculate Taxes" to generate report.
          </Text>
        </View>
      </View>
    </View>
  );
}
