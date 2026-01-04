import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { useAuth } from '../../context/AuthContext'
import { authApi } from '../../lib/api'

export default function LoginScreen() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { login } = useAuth()
  const router = useRouter()

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Username and password are required')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await authApi.login(username.trim(), password)
      
      if (result.error) {
        setError(result.error)
        return
      }

      if (result.data?.token) {
        await login(result.data.token)
        router.replace('/(tabs)')
      } else {
        setError('Invalid response from server')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView className="flex-1 bg-slate-50">
      <View className="flex-1 justify-center items-center p-8">
        <View className="w-full max-w-md">
          <View className="text-center mb-8">
            <Text className="text-3xl font-bold text-slate-900 mb-2">Crypto Tracker</Text>
            <Text className="text-slate-600">Sign in to your account</Text>
          </View>
          
          {error && (
            <View className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <Text className="text-red-700 text-sm">{error}</Text>
            </View>
          )}

          <View className="space-y-4">
            <View>
              <Text className="text-sm font-medium text-slate-700 mb-2">Username or Email</Text>
              <TextInput
                className="w-full h-12 px-3 border border-slate-300 rounded-lg bg-white"
                placeholder="Enter your username or email"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                editable={!loading}
              />
            </View>
            
            <View>
              <Text className="text-sm font-medium text-slate-700 mb-2">Password</Text>
              <TextInput
                className="w-full h-12 px-3 border border-slate-300 rounded-lg bg-white"
                placeholder="Enter your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!loading}
                onSubmitEditing={handleLogin}
              />
            </View>
            
            <TouchableOpacity 
              className="w-full h-12 bg-slate-900 rounded-lg justify-center items-center mt-6"
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-white font-medium">Sign In</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  )
}
