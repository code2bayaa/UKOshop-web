/**
 * Google sign-in via Google Identity Services (the official button).
 * Needs VITE_GOOGLE_CLIENT_ID in front-end/web-app/.env (same OAuth client as GOOGLE_CLIENT_ID on the API).
 * The button hands back an ID token (credential) that the API verifies at POST /api/auth/google.
 */
import { useEffect, useRef, useState } from 'react'
import { Notice } from './ui'

declare global {
  interface Window { google?: any }
}

export const GOOGLE_CLIENT_ID: string = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID) || ''
const GSI_SRC = 'https://accounts.google.com/gsi/client'
let gsiPromise: Promise<void> | null = null

function loadGsi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.google?.accounts?.id) return Promise.resolve()
  if (!gsiPromise) {
    gsiPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${GSI_SRC}"]`) as HTMLScriptElement | null
      if (existing) {
        existing.addEventListener('load', () => resolve())
        existing.addEventListener('error', () => reject(new Error('Google script failed to load')))
        return
      }
      const s = document.createElement('script')
      s.src = GSI_SRC
      s.async = true
      s.defer = true
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Google script failed to load'))
      document.head.appendChild(s)
    })
  }
  return gsiPromise
}

export function GoogleSignInButton({ onCredential, text = 'continue_with', disabled, hint }: {
  onCredential: (idToken: string) => void | Promise<void>
  text?: 'signin_with' | 'signup_with' | 'continue_with'
  disabled?: boolean
  hint?: string
}) {
  const slot = useRef<HTMLDivElement>(null)
  const cb = useRef(onCredential)
  cb.current = onCredential
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return setState('error')
    let cancelled = false
    loadGsi()
      .then(() => {
        if (cancelled || !slot.current || !window.google?.accounts?.id) return
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (resp: { credential?: string }) => { if (resp?.credential) cb.current(resp.credential) },
          ux_mode: 'popup',
          auto_select: false,
        })
        slot.current.innerHTML = ''
        window.google.accounts.id.renderButton(slot.current, { theme: 'outline', size: 'large', shape: 'rectangular', text, width: Math.min(400, slot.current.clientWidth || 360), logo_alignment: 'left' })
        setState('ready')
      })
      .catch(() => { if (!cancelled) setState('error') })
    return () => { cancelled = true }
  }, [text])

  if (!GOOGLE_CLIENT_ID) {
    return <Notice tone="info">Google sign-in is not configured — add <code>VITE_GOOGLE_CLIENT_ID</code> to <code>front-end/web-app/.env</code> (and <code>GOOGLE_CLIENT_ID</code> on the API).</Notice>
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className={disabled ? 'pointer-events-none opacity-50' : ''}>
        <div ref={slot} className="flex min-h-[44px] w-full justify-center" />
        {state === 'loading' && <div className="h-11 w-full animate-pulse rounded-md bg-surface-2" />}
        {state === 'error' && <span className="text-[11px] text-danger">Could not load the Google button — check your connection and that this origin is allowed for the OAuth client.</span>}
      </div>
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </div>
  )
}
