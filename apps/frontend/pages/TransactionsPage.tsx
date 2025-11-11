import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function TransactionsPage() {
  return (
    <ScrollView className="flex-1 bg-slate-50">
      <View className="p-4 space-y-4">
        <View className="space-y-1 mb-2">
          <Text className="text-3xl font-bold text-slate-900">Transactions</Text>
          <Text className="text-slate-600">View and filter all your crypto transactions</Text>
        </View>

        <View className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm items-center justify-center min-h-[400px]">
          <Text className="text-slate-600 text-center">
            Transactions will be displayed here once you import data from your exchanges.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
