import { Tabs } from 'expo-router'
import { Platform, TouchableOpacity, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '../../context/AuthContext'

export default function TabLayout() {
  const { isAuthenticated, logout } = useAuth()
  const router = useRouter()

  const handleLogout = async () => {
    await logout()
    router.replace('/auth/login')
  }

  const handleLogin = () => {
    router.push('/auth/login')
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1e293b',
        tabBarInactiveTintColor: '#64748b',
        tabBarStyle: {
          backgroundColor: 'white',
          borderTopColor: '#e2e8f0',
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 85 : 65,
          paddingBottom: Platform.OS === 'ios' ? 25 : 5,
        },
        headerStyle: {
          backgroundColor: 'white',
          borderBottomColor: '#e2e8f0',
          borderBottomWidth: 1,
        },
        headerTintColor: '#1e293b',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        headerRight: Platform.OS === 'web' ? () => (
          <View style={{ marginRight: 16 }}>
            {isAuthenticated ? (
              <TouchableOpacity
                onPress={handleLogout}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  backgroundColor: '#f1f5f9',
                  borderRadius: 8,
                }}
              >
                <Ionicons name="log-out-outline" size={18} color="#1e293b" />
                <Text style={{ color: '#1e293b', fontWeight: '500' }}>Logout</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleLogin}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  backgroundColor: '#2563eb',
                  borderRadius: 8,
                }}
              >
                <Ionicons name="log-in-outline" size={18} color="white" />
                <Text style={{ color: 'white', fontWeight: '500' }}>Login</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : undefined,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="imports"
        options={{
          title: 'Imports',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="download-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="taxes"
        options={{
          title: 'Taxes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calculator-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="swap-horizontal-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
