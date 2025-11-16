import { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { exchangeApi, Exchange } from '../lib/api'

export default function AddExchangeScreen() {
  const router = useRouter()
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [selectedExchange, setSelectedExchange] = useState<Exchange | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadExchanges()
  }, [])

  const loadExchanges = async () => {
    setLoading(true)
    const result = await exchangeApi.getExchanges()
    if (result.error) {
      Alert.alert('Error', result.error)
    } else if (result.data) {
      setExchanges(result.data)
    }
    setLoading(false)
  }

  const handleSelectExchange = (exchange: Exchange) => {
    setSelectedExchange(exchange)
    // Initialize form data with empty values
    const initialData: Record<string, string> = {}
    exchange.config_parameters.forEach((param) => {
      initialData[param.name] = ''
    })
    setFormData(initialData)
  }

  const handleInputChange = (name: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async () => {
    if (!selectedExchange) {
      Alert.alert('Error', 'Please select an exchange')
      return
    }

    // Validate required fields
    const missingFields: string[] = []
    selectedExchange.config_parameters.forEach((param) => {
      if (param.required && !formData[param.name]) {
        missingFields.push(param.label || param.name)
      }
    })

    if (missingFields.length > 0) {
      Alert.alert('Validation Error', `Please fill in all required fields: ${missingFields.join(', ')}`)
      return
    }

    setSubmitting(true)
    const result = await exchangeApi.createConfig({
      exchange_id: selectedExchange.id,
      config_data: formData,
    })

    setSubmitting(false)

    if (result.error) {
      Alert.alert('Error', result.error)
    } else {
      // Redirect to imports list after successful save
      router.replace('/(tabs)/imports')
    }
  }

  if (loading) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="mt-4 text-slate-600">Loading exchanges...</Text>
      </View>
    )
  }

  return (
    <ScrollView className="flex-1 bg-slate-50">
      <View className="p-4 space-y-4">
        {/* Header */}
        <View className="flex-row items-center mb-4">
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <Ionicons name="arrow-back" size={24} color="#1e293b" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-3xl font-bold text-slate-900">Add Exchange</Text>
            <Text className="text-slate-600">Configure a new exchange connection</Text>
          </View>
        </View>

        {/* Exchange Selection */}
        {!selectedExchange ? (
          <View className="space-y-4">
            <Text className="text-xl font-semibold text-slate-900">Select an Exchange</Text>
            {exchanges.length === 0 ? (
              <View className="bg-white rounded-lg border border-slate-200 p-6 items-center">
                <Text className="text-slate-600 text-center">No exchanges available</Text>
              </View>
            ) : (
              <View className="space-y-3">
                {exchanges.map((exchange) => (
                  <TouchableOpacity
                    key={exchange.id}
                    onPress={() => handleSelectExchange(exchange)}
                    className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm"
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1">
                        <Text className="text-lg font-semibold text-slate-900">
                          {exchange.display_name}
                        </Text>
                        {exchange.description && (
                          <Text className="text-sm text-slate-600 mt-1">{exchange.description}</Text>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#64748b" />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ) : (
          <View className="space-y-4">
            {/* Back to selection */}
            <TouchableOpacity
              onPress={() => {
                setSelectedExchange(null)
                setFormData({})
              }}
              className="flex-row items-center"
            >
              <Ionicons name="arrow-back" size={20} color="#3b82f6" />
              <Text className="ml-2 text-blue-600 font-medium">Back to selection</Text>
            </TouchableOpacity>

            {/* Exchange info */}
            <View className="bg-white rounded-lg border border-slate-200 p-4">
              <Text className="text-xl font-semibold text-slate-900">{selectedExchange.display_name}</Text>
              {selectedExchange.description && (
                <Text className="text-sm text-slate-600 mt-1">{selectedExchange.description}</Text>
              )}
            </View>

            {/* Configuration form */}
            <View className="space-y-4">
              <Text className="text-xl font-semibold text-slate-900">Configuration</Text>
              {selectedExchange.config_parameters.map((param) => (
                <View key={param.name} className="bg-white rounded-lg border border-slate-200 p-4">
                  <View className="mb-2">
                    <Text className="text-sm font-medium text-slate-900">
                      {param.label}
                      {param.required && <Text className="text-red-500"> *</Text>}
                    </Text>
                    {param.description && (
                      <Text className="text-xs text-slate-500 mt-1">{param.description}</Text>
                    )}
                  </View>
                  {param.type === 'password' ? (
                    <TextInput
                      secureTextEntry
                      value={formData[param.name] || ''}
                      onChangeText={(value) => handleInputChange(param.name, value)}
                      placeholder={`Enter ${param.label.toLowerCase()}`}
                      className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  ) : (
                    <TextInput
                      value={formData[param.name] || ''}
                      onChangeText={(value) => handleInputChange(param.name, value)}
                      placeholder={`Enter ${param.label.toLowerCase()}`}
                      className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  )}
                </View>
              ))}
            </View>

            {/* Submit button */}
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              className={`bg-blue-600 px-6 py-3 rounded-lg flex-row items-center justify-center ${
                submitting ? 'opacity-50' : ''
              }`}
            >
              {submitting ? (
                <>
                  <ActivityIndicator size="small" color="white" className="mr-2" />
                  <Text className="text-white font-medium">Saving...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="white" />
                  <Text className="text-white font-medium ml-2">Save Configuration</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  )
}

