import React, { createContext, useContext, useState, useEffect } from 'react'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

// Platform-aware storage functions
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return localStorage.getItem(key)
      } catch (error) {
        console.error('Error reading from localStorage:', error)
        return null
      }
    } else {
      try {
        return await SecureStore.getItemAsync(key)
      } catch (error) {
        console.error('Error reading from SecureStore:', error)
        return null
      }
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        localStorage.setItem(key, value)
      } catch (error) {
        console.error('Error writing to localStorage:', error)
        throw error
      }
    } else {
      try {
        await SecureStore.setItemAsync(key, value)
      } catch (error) {
        console.error('Error writing to SecureStore:', error)
        throw error
      }
    }
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        localStorage.removeItem(key)
      } catch (error) {
        console.error('Error removing from localStorage:', error)
        throw error
      }
    } else {
      try {
        await SecureStore.deleteItemAsync(key)
      } catch (error) {
        console.error('Error removing from SecureStore:', error)
        throw error
      }
    }
  },
}

interface AuthContextType {
  isAuthenticated: boolean
  login: (token: string) => Promise<void>
  logout: () => Promise<void>
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuthStatus()
  }, [])

  const checkAuthStatus = async () => {
    try {
      const token = await storage.getItem('authToken')
      setIsAuthenticated(!!token)
    } catch (error) {
      console.error('Error checking auth status:', error)
    } finally {
      setLoading(false)
    }
  }

  const login = async (token: string) => {
    try {
      await storage.setItem('authToken', token)
      setIsAuthenticated(true)
    } catch (error) {
      console.error('Error saving auth token:', error)
      throw error
    }
  }

  const logout = async () => {
    try {
      await storage.removeItem('authToken')
      setIsAuthenticated(false)
    } catch (error) {
      console.error('Error removing auth token:', error)
      throw error
    }
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
