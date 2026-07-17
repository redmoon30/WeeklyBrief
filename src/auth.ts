import { GOOGLE_CLIENT_ID, SCOPES } from './config'

// Google Identity Services 沒有官方 @types，最小宣告需要的介面即可。
declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (response: TokenResponse) => void
            error_callback?: (error: { type: string }) => void
          }): TokenClient
        }
      }
    }
  }
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void
}

interface TokenResponse {
  access_token?: string
  error?: string
}

let accessToken: string | null = null

/** 用即丟：token 只放記憶體，關頁/重整就消失，不寫 localStorage/sessionStorage。 */
export function getAccessToken(): string | null {
  return accessToken
}

export function login(): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? '登入失敗，未取得 access token'))
          return
        }
        accessToken = response.access_token
        resolve(accessToken)
      },
      error_callback: (error) => {
        reject(new Error(`登入被取消或失敗：${error.type}`))
      },
    })
    client.requestAccessToken({ prompt: 'consent' })
  })
}
