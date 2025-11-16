import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { exchangeApi, ExchangeConnection, ImportHistoryLog } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'

export default function ImportsScreen() {
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const [configs, setConfigs] = useState<ExchangeConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importLogs, setImportLogs] = useState<ImportHistoryLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [importingConfigs, setImportingConfigs] = useState<Set<string>>(new Set())

  const fetchConfigs = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    const result = await exchangeApi.getConfigs()
    if (result.error) {
      if (!silent) {
        setError(result.error)
      }
    } else if (result.data) {
      setConfigs(result.data)
    }
    if (!silent) {
      setLoading(false)
    }
  }, [])

  const fetchImportLogs = useCallback(async (silent = false) => {
    if (!silent) {
      setLogsLoading(true)
    }
    const result = await exchangeApi.getImportHistory(50, 0)
    if (result.error) {
      console.error('Error fetching import logs:', result.error)
    } else if (result.data) {
      setImportLogs(result.data)
    }
    if (!silent) {
      setLogsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      fetchConfigs()
      fetchImportLogs()
    }
  }, [isAuthenticated, fetchConfigs, fetchImportLogs])

  // Poll import history every 5 seconds if there are running imports
  useEffect(() => {
    if (!isAuthenticated) return

    // Check if there are any running imports
    const hasRunningImports = importLogs.some(log => 
      log.status === 'running' || (log.status === 'success' && !log.end_time)
    )

    // Only poll if there are running imports or if we just triggered an import
    const shouldPoll = hasRunningImports || importingConfigs.size > 0

    if (!shouldPoll) return

    const interval = setInterval(() => {
      // Poll silently (without showing loading indicators)
      fetchImportLogs(true)
      // Also refresh configs to update last sync times
      fetchConfigs(true)
    }, 5000) // Poll every 5 seconds

    return () => clearInterval(interval)
  }, [isAuthenticated, importLogs, importingConfigs, fetchImportLogs, fetchConfigs])

  const handleManualImport = async (configId: string) => {
    setImportingConfigs((prev) => new Set(prev).add(configId))
    
    try {
      const result = await exchangeApi.triggerImport(configId)
      
      if (result.error) {
        Alert.alert('Import Error', result.error)
      } else {
        Alert.alert('Success', 'Import started successfully')
        // Refresh configs and logs after a short delay
        setTimeout(() => {
          fetchConfigs()
          fetchImportLogs()
        }, 1000)
      }
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to trigger import')
    } finally {
      setImportingConfigs((prev) => {
        const next = new Set(prev)
        next.delete(configId)
        return next
      })
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchConfigs(), fetchImportLogs()])
    setRefreshing(false)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'inactive':
        return 'bg-gray-100 text-gray-800'
      case 'error':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  // Check if there's a running import for a specific exchange config
  const hasRunningImport = (config: ExchangeConnection): boolean => {
    // Use exchangeName if available, otherwise fall back to name
    const exchangeName = (config.exchangeName || config.name).toLowerCase()
    let importerName: string
    let source: string

    // Map exchange name to importer_name and source (matching backend logic)
    if (exchangeName === 'coinbase_pro') {
      importerName = 'coinbase'
      source = 'pro'
    } else if (exchangeName === 'coinbase_app') {
      importerName = 'coinbase'
      source = 'app'
    } else if (exchangeName === 'coinbase') {
      importerName = 'coinbase'
      source = 'all'
    } else {
      // For other exchanges, use the name as importer name
      importerName = exchangeName
      source = 'all'
    }

    // Check if there's a running import matching this exchange
    // Status 'running' means it's currently executing
    return importLogs.some(log => {
      const matchesImporter = log.importer_name === importerName
      const matchesSource = log.source === source || source === 'all' || log.source === 'all'
      const isRunning = log.status === 'running'
      return matchesImporter && matchesSource && isRunning
    })
  }

  return (
    <ScrollView 
      className="flex-1 bg-slate-50"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View className="p-4 space-y-4">
        <View className="flex-row justify-between items-center mb-2">
          <View className="space-y-1">
            <Text className="text-3xl font-bold text-slate-900">Exchange Imports</Text>
            <Text className="text-slate-600">Manage your exchange connections and data imports</Text>
          </View>
          <TouchableOpacity 
            onPress={() => router.push('/add-exchange')}
            className="bg-blue-600 px-4 py-2 rounded-lg flex-row items-center gap-2"
          >
            <Ionicons name="add" size={16} color="white" />
            <Text className="text-white font-medium">Add Exchange</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm items-center justify-center min-h-[400px]">
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text className="text-slate-600 mt-4">Loading exchanges...</Text>
          </View>
        ) : error ? (
          <View className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm items-center justify-center min-h-[400px]">
            <Ionicons name="alert-circle" size={48} color="#ef4444" />
            <Text className="text-red-600 mt-4 text-center">{error}</Text>
            <TouchableOpacity
              onPress={() => fetchConfigs()}
              className="mt-4 bg-blue-600 px-4 py-2 rounded-lg"
            >
              <Text className="text-white font-medium">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : configs.length === 0 ? (
          <View className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm items-center justify-center min-h-[400px]">
            <Ionicons name="cloud-outline" size={64} color="#94a3b8" />
            <Text className="text-slate-600 text-center mt-4 mb-6">
              No exchange connections configured. Add your first exchange to start importing data.
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/add-exchange')}
              className="bg-blue-600 px-6 py-3 rounded-lg flex-row items-center gap-2"
            >
              <Ionicons name="add" size={20} color="white" />
              <Text className="text-white font-medium">Add Exchange</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="space-y-3">
            {configs.map((config) => (
              <View
                key={config.id}
                className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm"
              >
                <View className="flex-row items-start justify-between mb-3">
                  <View className="flex-1">
                    <Text className="text-lg font-semibold text-slate-900">{config.name}</Text>
                    <View className="flex-row items-center gap-2 mt-1">
                      <View className={`px-2 py-1 rounded ${getStatusColor(config.status)}`}>
                        <Text className="text-xs font-medium capitalize">{config.status}</Text>
                      </View>
                      {config.autoImport && (
                        <View className="flex-row items-center gap-1">
                          <Ionicons name="sync" size={14} color="#3b82f6" />
                          <Text className="text-xs text-blue-600">Auto-import</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>

                <View className="border-t border-slate-200 pt-3 mt-3">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-sm text-slate-600">Last Sync</Text>
                    <View className="flex-row items-center gap-3">
                      <Text className="text-sm font-medium text-slate-900">
                        {formatDate(config.lastSync)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleManualImport(config.id)}
                        disabled={importingConfigs.has(config.id) || hasRunningImport(config)}
                        className={`px-3 py-1.5 rounded-lg flex-row items-center gap-1.5 ${
                          importingConfigs.has(config.id) || hasRunningImport(config)
                            ? 'bg-slate-200'
                            : 'bg-blue-600'
                        }`}
                      >
                        {importingConfigs.has(config.id) || hasRunningImport(config) ? (
                          <ActivityIndicator size="small" color="#64748b" />
                        ) : (
                          <Ionicons name="play" size={14} color="white" />
                        )}
                        <Text
                          className={`text-xs font-medium ${
                            importingConfigs.has(config.id) || hasRunningImport(config)
                              ? 'text-slate-600'
                              : 'text-white'
                          }`}
                        >
                          {importingConfigs.has(config.id) || hasRunningImport(config) ? 'Importing...' : 'Import'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {config.importSources && config.importSources.length > 0 && (
                    <View className="mt-2">
                      <Text className="text-xs text-slate-500 mb-1">Import Sources:</Text>
                      <View className="space-y-1">
                        {config.importSources.map((source, idx) => (
                          <View key={idx} className="flex-row items-center justify-between">
                            <View className="flex-row items-center gap-2">
                              <Text className="text-xs text-slate-700 capitalize">{source.source}</Text>
                              {source.autoImport && (
                                <Ionicons name="sync" size={12} color="#3b82f6" />
                              )}
                            </View>
                            <Text className="text-xs text-slate-500">
                              {formatDate(source.lastSync)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Import History Logs Section */}
        <View className="mt-8">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xl font-bold text-slate-900">Import History</Text>
            <TouchableOpacity onPress={() => fetchImportLogs()} className="flex-row items-center gap-2">
              <Ionicons name="refresh" size={18} color="#3b82f6" />
              <Text className="text-blue-600 text-sm font-medium">Refresh</Text>
            </TouchableOpacity>
          </View>

          {logsLoading ? (
            <View className="bg-white rounded-lg border border-slate-200 p-6 items-center justify-center min-h-[200px]">
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text className="text-slate-600 mt-4">Loading import logs...</Text>
            </View>
          ) : importLogs.length === 0 ? (
            <View className="bg-white rounded-lg border border-slate-200 p-6 items-center justify-center min-h-[200px]">
              <Ionicons name="document-text-outline" size={48} color="#94a3b8" />
              <Text className="text-slate-600 mt-4 text-center">No import history yet</Text>
            </View>
          ) : (
            <View className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <ScrollView className="max-h-[400px]">
                {importLogs.map((log) => (
                  <View
                    key={log.id}
                    className="border-b border-slate-200 p-4 last:border-b-0"
                  >
                    <View className="flex-row items-start justify-between mb-2">
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2 mb-1">
                          <Text className="font-semibold text-slate-900 capitalize">
                            {log.importer_name}
                          </Text>
                          <Text className="text-xs text-slate-500 capitalize">({log.source})</Text>
                          <View
                            className={`px-2 py-1 rounded ${
                              log.status === 'success'
                                ? 'bg-green-100'
                                : log.status === 'failed'
                                ? 'bg-red-100'
                                : log.status === 'running'
                                ? 'bg-blue-100'
                                : 'bg-gray-100'
                            }`}
                          >
                            <Text
                              className={`text-xs font-medium capitalize ${
                                log.status === 'success'
                                  ? 'text-green-800'
                                  : log.status === 'failed'
                                  ? 'text-red-800'
                                  : log.status === 'running'
                                  ? 'text-blue-800'
                                  : 'text-gray-800'
                              }`}
                            >
                              {log.status}
                            </Text>
                          </View>
                        </View>
                        <Text className="text-xs text-slate-500">
                          {new Date(log.start_time).toLocaleString()}
                        </Text>
                      </View>
                    </View>

                    {log.records_processed !== null && (
                      <Text className="text-sm text-slate-700 mt-1">
                        Records: {typeof log.records_processed === 'number' 
                          ? log.records_processed.toLocaleString() 
                          : parseInt(String(log.records_processed) || '0', 10).toLocaleString()}
                      </Text>
                    )}

                    {log.duration_seconds !== null && (
                      <Text className="text-xs text-slate-500 mt-1">
                        Duration: {typeof log.duration_seconds === 'number' 
                          ? log.duration_seconds.toFixed(1) 
                          : parseFloat(log.duration_seconds || '0').toFixed(1)}s
                      </Text>
                    )}

                    {log.error_message && (
                      <View className="mt-2 p-2 bg-red-50 rounded">
                        <Text className="text-xs text-red-800 font-mono">
                          {log.error_message}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  )
}
