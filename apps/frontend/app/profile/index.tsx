import { View, Text, ScrollView } from 'react-native';

export default function ProfileScreen() {
  return (
    <ScrollView className="flex-1 bg-slate-50">
      <View className="p-4 space-y-4">
        <View className="space-y-1 mb-2">
          <Text className="text-3xl font-bold text-slate-900">Profile</Text>
          <Text className="text-slate-600">Manage your account settings</Text>
        </View>

        <View className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm items-center justify-center min-h-[400px]">
          <Text className="text-slate-600 text-center">
            Profile settings will be displayed here.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

