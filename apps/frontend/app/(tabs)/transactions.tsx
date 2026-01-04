import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { transactionApi, Transaction } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';

// Transaction type colors - returns background, border, and text color classes
const getTransactionTypeColors = (type: string): { bg: string; border: string; text: string } => {
  const typeLower = type.toLowerCase();
  switch (typeLower) {
    case 'buy':
    case 'receive':
    case 'fiat_deposit':
      return { bg: 'bg-green-100', border: 'border-green-300', text: 'text-green-800' };
    case 'sell':
    case 'send':
    case 'fiat_withdrawal':
      return { bg: 'bg-red-100', border: 'border-red-300', text: 'text-red-800' };
    case 'trade':
    case 'advanced_trade_fill':
      return { bg: 'bg-blue-100', border: 'border-blue-300', text: 'text-blue-800' };
    default:
      return { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-800' };
  }
};

// Format transaction type for display
const formatTransactionType = (type: string): string => {
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Format column name for display
const formatColumnName = (column: keyof Transaction): string => {
  const columnMap: Record<string, string> = {
    transaction_id: 'ID',
    date: 'Date',
    type: 'Type',
    exchange: 'Exchange',
    asset: 'Asset',
    amount: 'Amount',
    total_usd: 'Value',
    total_currency: 'Currency',
    source: 'Source',
    ingestion_time: 'Ingestion Time',
  };
  return columnMap[column] || column;
};

// Format date for display
const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Format date for table (yyyy-mm-dd hh:mm:ss)
const formatDateTable = (dateString: string): string => {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// Format currency amount
const formatAmount = (amount: number | null, currency: string): string => {
  if (amount === null || amount === undefined) return 'N/A';
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 8 })} ${currency}`;
};

// Format amount for table (more compact)
const formatAmountCompact = (amount: number | null, currency: string): string => {
  if (amount === null || amount === undefined) return 'N/A';
  // Show sign for better visibility
  const sign = amount >= 0 ? '+' : '';
  const formatted = Math.abs(amount).toLocaleString('en-US', { 
    maximumFractionDigits: amount < 1 ? 8 : 2,
    minimumFractionDigits: 0
  });
  return `${sign}${formatted} ${currency}`;
};

export default function TransactionsScreen() {
  const { isAuthenticated } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filter states
  const [searchText, setSearchText] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedExchange, setSelectedExchange] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  
  // Sort states
  const [sortColumn, setSortColumn] = useState<keyof Transaction | null>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Get unique values for filter dropdowns
  const uniqueTypes = Array.from(new Set(transactions.map(t => t.type))).sort();
  const uniqueExchanges = Array.from(new Set(transactions.map(t => t.exchange))).sort();
  const uniqueAssets = Array.from(new Set(transactions.map(t => t.asset))).sort();

  const fetchTransactions = useCallback(async (silent = false) => {
    if (!isAuthenticated) return;
    
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    const filters: any = {};
    if (selectedType) filters.type = selectedType;
    if (selectedExchange) filters.exchange = selectedExchange;
    if (selectedAsset) filters.asset = selectedAsset;

    const result = await transactionApi.getTransactions({
      limit: 1000, // Get a large batch
      offset: 0,
      ...filters,
    });

    if (result.error) {
      if (!silent) {
        setError(result.error);
      }
      setTransactions([]);
    } else if (result.data) {
      // Filter by search text if provided
      let filtered = result.data;
      if (searchText.trim()) {
        const searchLower = searchText.toLowerCase();
        filtered = result.data.filter(t =>
          t.transaction_id.toLowerCase().includes(searchLower) ||
          t.type.toLowerCase().includes(searchLower) ||
          t.asset.toLowerCase().includes(searchLower) ||
          t.exchange.toLowerCase().includes(searchLower) ||
          formatDate(t.date).toLowerCase().includes(searchLower)
        );
      }
      // Sort by selected column and direction
      if (sortColumn) {
        filtered.sort((a, b) => {
          let aVal: any = a[sortColumn];
          let bVal: any = b[sortColumn];
          
          // Handle date sorting
          if (sortColumn === 'date') {
            aVal = new Date(aVal).getTime();
            bVal = new Date(bVal).getTime();
          }
          // Handle numeric sorting
          else if (sortColumn === 'amount' || sortColumn === 'total_usd') {
            aVal = aVal ?? 0;
            bVal = bVal ?? 0;
          }
          // Handle string sorting
          else {
            aVal = (aVal ?? '').toString().toLowerCase();
            bVal = (bVal ?? '').toString().toLowerCase();
          }
          
          if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
          return 0;
        });
      }
      setTransactions(filtered);
    }

    if (!silent) {
      setLoading(false);
    }
  }, [isAuthenticated, selectedType, selectedExchange, selectedAsset, searchText, sortColumn, sortDirection]);
  
  const handleSort = (column: keyof Transaction) => {
    if (sortColumn === column) {
      // Toggle direction if clicking the same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new column and default to ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
  };
  
  const getSortIcon = (column: keyof Transaction) => {
    if (sortColumn !== column) {
      return 'swap-vertical-outline'; // Neutral icon when not sorted
    }
    return sortDirection === 'asc' ? 'arrow-up' : 'arrow-down';
  };
  
  const getSortIconColor = (column: keyof Transaction) => {
    if (sortColumn !== column) {
      return '#94a3b8'; // Gray when not sorted
    }
    return '#3b82f6'; // Blue when sorted
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchTransactions();
    }
  }, [isAuthenticated, fetchTransactions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTransactions(true);
    setRefreshing(false);
  }, [fetchTransactions]);

  const clearFilters = () => {
    setSearchText('');
    setSelectedType(null);
    setSelectedExchange(null);
    setSelectedAsset(null);
  };

  const hasActiveFilters = selectedType || selectedExchange || selectedAsset || searchText.trim();

  if (!isAuthenticated) {
    return (
      <ScrollView className="flex-1 bg-slate-50">
        <View className="p-4">
          <Text className="text-slate-600 text-center">Please log in to view transactions.</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView 
      className="flex-1 bg-slate-50"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View className="p-4 space-y-4">
        <View className="space-y-1 mb-2">
          <Text className="text-3xl font-bold text-slate-900">Transactions</Text>
          <Text className="text-slate-600">View and filter all your crypto transactions</Text>
        </View>

        {/* Search and Filter Bar */}
        <View className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <View className="flex-row items-center space-x-2 mb-3">
            <View className="flex-1 flex-row items-center bg-slate-100 rounded-lg px-3 py-2">
              <Ionicons name="search" size={20} color="#64748b" />
              <TextInput
                className="flex-1 ml-2 text-slate-900"
                placeholder="Search transactions..."
                value={searchText}
                onChangeText={setSearchText}
                placeholderTextColor="#94a3b8"
              />
            </View>
            <TouchableOpacity
              onPress={() => setShowFilters(!showFilters)}
              className={cn(
                "px-3 py-2 rounded-lg border",
                showFilters ? "bg-blue-50 border-blue-300" : "bg-slate-100 border-slate-300"
              )}
            >
              <Ionicons 
                name={showFilters ? "filter" : "options-outline"} 
                size={20} 
                color={showFilters ? "#2563eb" : "#64748b"} 
              />
            </TouchableOpacity>
          </View>

          {/* Filter Panel */}
          {showFilters && (
            <View className="space-y-3 pt-3 border-t border-slate-200">
              {/* Type Filter */}
              <View>
                <Text className="text-sm font-semibold text-slate-700 mb-2">Transaction Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row space-x-2">
                  <TouchableOpacity
                    onPress={() => setSelectedType(null)}
                    className={cn(
                      "px-3 py-1.5 rounded-full border",
                      !selectedType
                        ? "bg-blue-100 border-blue-300"
                        : "bg-slate-100 border-slate-300"
                    )}
                  >
                    <Text className={cn("text-sm", !selectedType ? "text-blue-800 font-semibold" : "text-slate-600")}>
                      All
                    </Text>
                  </TouchableOpacity>
                  {uniqueTypes.map((type) => {
                    const colors = getTransactionTypeColors(type);
                    return (
                      <TouchableOpacity
                        key={type}
                        onPress={() => setSelectedType(selectedType === type ? null : type)}
                        className={cn(
                          "px-3 py-1.5 rounded-full border",
                          selectedType === type
                            ? `${colors.bg} ${colors.border}`
                            : "bg-slate-100 border-slate-300"
                        )}
                      >
                        <Text className={cn(
                          "text-sm",
                          selectedType === type ? `${colors.text} font-semibold` : "text-slate-600"
                        )}>
                          {formatTransactionType(type)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Exchange Filter */}
              <View>
                <Text className="text-sm font-semibold text-slate-700 mb-2">Exchange</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row space-x-2">
                  <TouchableOpacity
                    onPress={() => setSelectedExchange(null)}
                    className={cn(
                      "px-3 py-1.5 rounded-full border",
                      !selectedExchange
                        ? "bg-blue-100 border-blue-300"
                        : "bg-slate-100 border-slate-300"
                    )}
                  >
                    <Text className={cn("text-sm", !selectedExchange ? "text-blue-800 font-semibold" : "text-slate-600")}>
                      All
                    </Text>
                  </TouchableOpacity>
                  {uniqueExchanges.map((exchange) => (
                    <TouchableOpacity
                      key={exchange}
                      onPress={() => setSelectedExchange(selectedExchange === exchange ? null : exchange)}
                      className={cn(
                        "px-3 py-1.5 rounded-full border",
                        selectedExchange === exchange
                          ? "bg-blue-100 border-blue-300"
                          : "bg-slate-100 border-slate-300"
                      )}
                    >
                      <Text className={cn(
                        "text-sm",
                        selectedExchange === exchange ? "text-blue-800 font-semibold" : "text-slate-600"
                      )}>
                        {exchange.replace('_', ' ').toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Asset Filter */}
              <View>
                <Text className="text-sm font-semibold text-slate-700 mb-2">Asset</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row space-x-2">
                  <TouchableOpacity
                    onPress={() => setSelectedAsset(null)}
                    className={cn(
                      "px-3 py-1.5 rounded-full border",
                      !selectedAsset
                        ? "bg-blue-100 border-blue-300"
                        : "bg-slate-100 border-slate-300"
                    )}
                  >
                    <Text className={cn("text-sm", !selectedAsset ? "text-blue-800 font-semibold" : "text-slate-600")}>
                      All
                    </Text>
                  </TouchableOpacity>
                  {uniqueAssets.slice(0, 20).map((asset) => (
                    <TouchableOpacity
                      key={asset}
                      onPress={() => setSelectedAsset(selectedAsset === asset ? null : asset)}
                      className={cn(
                        "px-3 py-1.5 rounded-full border",
                        selectedAsset === asset
                          ? "bg-blue-100 border-blue-300"
                          : "bg-slate-100 border-slate-300"
                      )}
                    >
                      <Text className={cn(
                        "text-sm",
                        selectedAsset === asset ? "text-blue-800 font-semibold" : "text-slate-600"
                      )}>
                        {asset}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Clear Filters Button */}
              {hasActiveFilters && (
                <TouchableOpacity
                  onPress={clearFilters}
                  className="mt-2 py-2 px-4 bg-slate-200 rounded-lg"
                >
                  <Text className="text-sm font-semibold text-slate-700 text-center">Clear All Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Active Filters Summary */}
        {hasActiveFilters && !showFilters && (
          <View className="flex-row flex-wrap gap-2">
            {selectedType && (
              <View className="flex-row items-center bg-blue-100 rounded-full px-3 py-1">
                <Text className="text-xs text-blue-800">Type: {formatTransactionType(selectedType)}</Text>
                <TouchableOpacity onPress={() => setSelectedType(null)} className="ml-2">
                  <Ionicons name="close-circle" size={16} color="#1e40af" />
                </TouchableOpacity>
              </View>
            )}
            {selectedExchange && (
              <View className="flex-row items-center bg-blue-100 rounded-full px-3 py-1">
                <Text className="text-xs text-blue-800">Exchange: {selectedExchange.replace('_', ' ').toUpperCase()}</Text>
                <TouchableOpacity onPress={() => setSelectedExchange(null)} className="ml-2">
                  <Ionicons name="close-circle" size={16} color="#1e40af" />
                </TouchableOpacity>
              </View>
            )}
            {selectedAsset && (
              <View className="flex-row items-center bg-blue-100 rounded-full px-3 py-1">
                <Text className="text-xs text-blue-800">Asset: {selectedAsset}</Text>
                <TouchableOpacity onPress={() => setSelectedAsset(null)} className="ml-2">
                  <Ionicons name="close-circle" size={16} color="#1e40af" />
                </TouchableOpacity>
              </View>
            )}
            {searchText.trim() && (
              <View className="flex-row items-center bg-blue-100 rounded-full px-3 py-1">
                <Text className="text-xs text-blue-800">Search: "{searchText}"</Text>
                <TouchableOpacity onPress={() => setSearchText('')} className="ml-2">
                  <Ionicons name="close-circle" size={16} color="#1e40af" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Loading State */}
        {loading && (
          <View className="bg-white rounded-lg border border-slate-200 p-8 items-center justify-center min-h-[400px]">
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text className="mt-4 text-slate-600">Loading transactions...</Text>
          </View>
        )}

        {/* Error State */}
        {error && !loading && (
          <View className="bg-red-50 rounded-lg border border-red-200 p-6">
            <View className="flex-row items-center mb-2">
              <Ionicons name="alert-circle" size={20} color="#dc2626" />
              <Text className="ml-2 text-red-800 font-semibold">Error</Text>
            </View>
            <Text className="text-red-700">{error}</Text>
            <TouchableOpacity
              onPress={() => fetchTransactions()}
              className="mt-4 bg-red-100 rounded-lg py-2 px-4"
            >
              <Text className="text-red-800 font-semibold text-center">Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Transactions Table */}
        {!loading && !error && (
          <>
            {transactions.length === 0 ? (
              <View className="bg-white rounded-lg border border-slate-200 p-8 items-center justify-center min-h-[400px]">
                <Ionicons name="receipt-outline" size={48} color="#94a3b8" />
                <Text className="mt-4 text-slate-600 text-center">
                  {hasActiveFilters
                    ? 'No transactions match your filters.'
                    : 'No transactions found. Import data from your exchanges to see transactions here.'}
                </Text>
                {hasActiveFilters && (
                  <TouchableOpacity
                    onPress={clearFilters}
                    className="mt-4 bg-blue-100 rounded-lg py-2 px-4"
                  >
                    <Text className="text-blue-800 font-semibold">Clear Filters</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                {/* Table Header */}
                <View className="flex-row bg-slate-50 border-b border-slate-200">
                  <TouchableOpacity 
                    className="w-36 px-2 py-3 border-r border-slate-200 flex-row items-center"
                    onPress={() => handleSort('transaction_id')}
                  >
                    <Text className="text-xs font-semibold text-slate-700 uppercase tracking-wider">ID</Text>
                    <Ionicons 
                      name={getSortIcon('transaction_id')} 
                      size={14} 
                      color={getSortIconColor('transaction_id')} 
                      style={{ marginLeft: 4 }}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    className="w-40 px-2 py-3 border-r border-slate-200 flex-row items-center"
                    onPress={() => handleSort('date')}
                  >
                    <Text className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Date</Text>
                    <Ionicons 
                      name={getSortIcon('date')} 
                      size={14} 
                      color={getSortIconColor('date')} 
                      style={{ marginLeft: 4 }}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    className="w-36 px-2 py-3 border-r border-slate-200 flex-row items-center"
                    onPress={() => handleSort('type')}
                  >
                    <Text className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Type</Text>
                    <Ionicons 
                      name={getSortIcon('type')} 
                      size={14} 
                      color={getSortIconColor('type')} 
                      style={{ marginLeft: 4 }}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    className="w-36 px-2 py-3 border-r border-slate-200 flex-row items-center"
                    onPress={() => handleSort('exchange')}
                  >
                    <Text className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Exchange</Text>
                    <Ionicons 
                      name={getSortIcon('exchange')} 
                      size={14} 
                      color={getSortIconColor('exchange')} 
                      style={{ marginLeft: 4 }}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    className="w-20 px-2 py-3 border-r border-slate-200 flex-row items-center"
                    onPress={() => handleSort('asset')}
                  >
                    <Text className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Asset</Text>
                    <Ionicons 
                      name={getSortIcon('asset')} 
                      size={14} 
                      color={getSortIconColor('asset')} 
                      style={{ marginLeft: 4 }}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    className="flex-1 px-2 py-3 border-r border-slate-200 flex-row items-center justify-end"
                    onPress={() => handleSort('amount')}
                  >
                    <Text className="text-xs font-semibold text-slate-700 uppercase tracking-wider text-right">Amount</Text>
                    <Ionicons 
                      name={getSortIcon('amount')} 
                      size={14} 
                      color={getSortIconColor('amount')} 
                      style={{ marginLeft: 4 }}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    className="flex-1 px-2 py-3 flex-row items-center justify-end"
                    onPress={() => handleSort('total_usd')}
                  >
                    <Text className="text-xs font-semibold text-slate-700 uppercase tracking-wider text-right">Value (USD)</Text>
                    <Ionicons 
                      name={getSortIcon('total_usd')} 
                      size={14} 
                      color={getSortIconColor('total_usd')} 
                      style={{ marginLeft: 4 }}
                    />
                  </TouchableOpacity>
                </View>

                {/* Table Body */}
                {transactions.map((transaction, index) => {
                  const colors = getTransactionTypeColors(transaction.type);
                  return (
                    <View
                      key={`${transaction.transaction_id}-${transaction.exchange}-${index}`}
                      className={cn(
                        "flex-row border-b border-slate-100",
                        index % 2 === 0 ? "bg-white" : "bg-slate-50"
                      )}
                    >
                      {/* Transaction ID Column */}
                      <View className="w-36 px-2 py-3 border-r border-slate-200">
                        <Text className="text-xs text-slate-600 font-mono" numberOfLines={1} ellipsizeMode="tail">
                          {transaction.transaction_id}
                        </Text>
                      </View>

                      {/* Date Column */}
                      <View className="w-40 px-2 py-3 border-r border-slate-200">
                        <Text className="text-xs text-slate-900 font-medium" numberOfLines={1}>
                          {formatDateTable(transaction.date)}
                        </Text>
                      </View>

                      {/* Type Column */}
                      <View className="w-36 px-2 py-3 border-r border-slate-200 justify-center">
                        <View className={cn(
                          "px-1.5 py-0.5 rounded-md border self-start",
                          colors.bg,
                          colors.border
                        )}>
                          <Text className={cn("text-xs font-semibold", colors.text)} numberOfLines={1}>
                            {formatTransactionType(transaction.type)}
                          </Text>
                        </View>
                      </View>

                      {/* Exchange Column */}
                      <View className="w-36 px-2 py-3 border-r border-slate-200 justify-center">
                        <Text className="text-xs text-slate-700 font-medium" numberOfLines={1}>
                          {transaction.exchange.replace('_', ' ').toUpperCase()}
                        </Text>
                      </View>

                      {/* Asset Column */}
                      <View className="w-20 px-2 py-3 border-r border-slate-200 justify-center">
                        <Text className="text-xs text-slate-900 font-semibold" numberOfLines={1}>
                          {transaction.asset}
                        </Text>
                      </View>

                      {/* Amount Column */}
                      <View className="flex-1 px-2 py-3 border-r border-slate-200 justify-center items-end">
                        <Text className="text-xs text-slate-900 font-medium text-right" numberOfLines={1}>
                          {formatAmountCompact(transaction.amount, transaction.asset)}
                        </Text>
                      </View>

                      {/* Value Column */}
                      <View className="flex-1 px-2 py-3 justify-center items-end">
                        <Text className="text-xs text-slate-900 font-semibold text-right" numberOfLines={1}>
                          {formatAmount(transaction.total_usd, transaction.total_currency || 'USD')}
                        </Text>
                      </View>
                    </View>
                  );
                })}

                {/* Table Footer */}
                <View className="bg-slate-50 border-t border-slate-200 px-4 py-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm text-slate-600">
                      Showing {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                    </Text>
                    {sortColumn && (
                      <Text className="text-xs text-slate-500">
                        Sorted by {formatColumnName(sortColumn)} ({sortDirection === 'asc' ? 'ascending' : 'descending'})
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}
