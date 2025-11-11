import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function ImportsPage() {
  return (
    <ScrollView className="flex-1 bg-slate-50">
      <View className="p-4 space-y-4">
        <View className="flex-row justify-between items-center mb-2">
          <View className="space-y-1">
            <Text className="text-3xl font-bold text-slate-900">Exchange Imports</Text>
            <Text className="text-slate-600">Manage your exchange connections and data imports</Text>
          </View>
          <TouchableOpacity className="bg-blue-600 px-4 py-2 rounded-lg flex-row items-center gap-2">
            <Ionicons name="add" size={16} color="white" />
            <Text className="text-white font-medium">Add Exchange</Text>
          </TouchableOpacity>
        </View>

        <View className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm items-center justify-center min-h-[400px]">
          <Text className="text-slate-600 text-center">
            No exchange connections configured. Add your first exchange to start importing data.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
