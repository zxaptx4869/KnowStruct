export interface CurrentUser {
  id: string
  login_name: string
}

export interface CurrentWorkspace {
  id: string
  name: string
}

export interface AuthSession {
  user: CurrentUser
  workspace: CurrentWorkspace
}

export interface LoginInput {
  account: string
  password: string
  remember_me: boolean
}

export type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated' | 'error'

export interface AuthContextValue {
  status: AuthStatus
  user: CurrentUser | null
  workspace: CurrentWorkspace | null
  login: (input: LoginInput) => Promise<void>
  logout: () => Promise<void>
  retry: () => Promise<void>
}
