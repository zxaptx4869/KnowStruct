import { createContext } from 'react'

export interface ToastApi {
  error: (message: string) => void
  success: (message: string) => void
  info: (message: string) => void
}

export const ToastContext = createContext<ToastApi | null>(null)
