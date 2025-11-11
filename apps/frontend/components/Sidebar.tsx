import { View, Text, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, usePathname } from 'expo-router'

export type PageType = 'dashboard' | 'imports' | 'taxes' | 'reports' | 'transactions' | 'alerts'

interface NavItem {
  id: PageType
  label: string
  iconName: keyof typeof Ionicons.glyphMap
  route: string
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', iconName: 'grid-outline', route: '/(tabs)' },
  { id: 'imports', label: 'Imports', iconName: 'download-outline', route: '/(tabs)/imports' },
  { id: 'taxes', label: 'Taxes', iconName: 'calculator-outline', route: '/(tabs)/taxes' },
  { id: 'reports', label: 'Reports', iconName: 'bar-chart-outline', route: '/(tabs)/reports' },
  { id: 'transactions', label: 'Transactions', iconName: 'swap-horizontal-outline', route: '/(tabs)/transactions' },
  { id: 'alerts', label: 'Alerts', iconName: 'notifications-outline', route: '/(tabs)/alerts' },
]

export function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()

  const handleNavigation = (route: string) => {
    router.push(route as any)
  }

  return (
    <View className="w-[280px] bg-white border-r border-slate-200 min-h-full p-4">
      <View className="mb-6">
        <Text className="text-2xl font-bold text-slate-900">
          Crypto Tracker
        </Text>
        <Text className="text-xs text-slate-600 mt-1">
          Asset Management
        </Text>
      </View>
      
      <View className="space-y-2">
        {navItems.map((item) => {
          const isActive = pathname === item.route || (item.route === '/(tabs)' && pathname === '/(tabs)')
          
          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => handleNavigation(item.route)}
              className={`w-full flex-row items-center px-3 py-2 rounded-lg ${
                isActive ? 'bg-slate-800' : 'bg-transparent'
              }`}
            >
              <Ionicons 
                name={item.iconName} 
                size={20} 
                color={isActive ? 'white' : '#475569'} 
              />
              <Text className={`text-sm font-medium ml-2 ${
                isActive ? 'text-white' : 'text-slate-700'
              }`}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}