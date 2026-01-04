import { View, Text, TouchableOpacity, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../context/AuthContext'

export function Header() {
  const { isAuthenticated, logout } = useAuth()
  const router = useRouter()

  const handleLogout = async () => {
    await logout()
    router.replace('/login')
  }

  const handleLogin = () => {
    router.push('/login')
  }

  if (Platform.OS === 'web') {
    return (
      <View className="w-full bg-white border-b border-slate-200 px-6 py-4 flex-row items-center justify-between">
        <View>
          <Text className="text-xl font-bold text-slate-900">Crypto Tracker</Text>
        </View>
        <View className="flex-row items-center gap-4">
          {isAuthenticated ? (
            <TouchableOpacity
              onPress={handleLogout}
              className="flex-row items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg hover:bg-slate-200"
            >
              <Ionicons name="log-out-outline" size={18} color="#1e293b" />
              <Text className="text-slate-900 font-medium">Logout</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleLogin}
              className="flex-row items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg"
            >
              <Ionicons name="log-in-outline" size={18} color="white" />
              <Text className="text-white font-medium">Login</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    )
  }

  return null // On mobile, use the tab header instead
}

