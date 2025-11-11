import { Stack, useRouter, useSegments } from 'expo-router'
import { Platform, View, ActivityIndicator } from 'react-native'
import { useEffect } from 'react'
import { AuthProvider, useAuth } from '../contexts/AuthContext'
import '../styles/global.css'

function RootLayoutNav() {
  const { isAuthenticated, loading } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (loading) return

    // Wait a tick to ensure router is ready
    const timer = setTimeout(() => {
      const firstSegment = segments[0]
      const inAuthGroup = firstSegment === '(tabs)'
      const onLoginPage = firstSegment === 'login'
      // Check if we're at root by checking if firstSegment is undefined
      const isRoot = !firstSegment

      if (!isAuthenticated) {
        // If not authenticated and trying to access protected routes or root, redirect to login
        if (inAuthGroup || isRoot) {
          router.replace('/login')
        }
      } else {
        // If authenticated and on login page or root, redirect to tabs
        if (onLoginPage || isRoot) {
          router.replace('/(tabs)')
        }
      }
    }, 0)

    return () => clearTimeout(timer)
  }, [isAuthenticated, loading, segments])

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    )
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen 
        name="(tabs)"
        options={{ 
          headerShown: false
        }}
      />
      <Stack.Screen 
        name="login" 
        options={{ 
          headerShown: Platform.OS === 'web' ? false : true,
          title: 'Login',
          headerStyle: {
            backgroundColor: 'white',
          },
          headerTintColor: '#1e293b',
        }} 
      />
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  )
}
