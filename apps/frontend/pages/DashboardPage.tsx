import { View, Text, ScrollView } from 'react-native';
import { BalanceCard } from '../components/BalanceCard';
import { StatCard } from '../components/StatCard';
import { PortfolioChart } from '../components/PortfolioChart';
import { TopAssets } from '../components/TopAssets';
import { Ionicons } from '@expo/vector-icons';

export function DashboardPage() {
  return (
    <ScrollView className="flex-1 bg-slate-50">
      <View className="p-4 space-y-6">
        <View className="space-y-2 mb-2">
          <Text className="text-3xl font-bold text-slate-900">Dashboard</Text>
          <Text className="text-slate-600">Track your crypto assets across exchanges</Text>
        </View>

        <View className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm items-center justify-center min-h-[400px]">
          <Text className="text-slate-600 text-center">
            Dashboard data will be displayed here once you connect exchanges and import data.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
