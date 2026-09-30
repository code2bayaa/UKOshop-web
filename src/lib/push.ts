/** Web push on this browser: register /sw.js, ask permission, subscribe with the API's VAPID key and save the
 *  subscription against the signed-in account (shop/back-end/app/routers/push.py). */
import { api, publicGet } from './api'

export type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on'

const SW_URL = '/sw.js'

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function serverKey(): Promise<string> {
  const r = await publicGet<{ enabled: boolean; public_key: string }>('/push/key')
  return r.enabled ? r.public_key : ''
}

function keyBytes(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration(SW_URL)) ?? navigator.serviceWorker.register(SW_URL)
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration(SW_URL)
  return reg ? reg.pushManager.getSubscription() : null
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (!(await serverKey())) return 'unconfigured'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.permission === 'granted' && (await currentSubscription()) ? 'on' : 'off'
}

/** Ask permission (must run from a click), subscribe and save. Throws with a readable message on failure. */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('This browser does not support push notifications')
  const key = await serverKey()
  if (!key) throw new Error('Push notifications are not set up on the server yet')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications are blocked for UKOshop in this browser. Allow them in the site settings to turn push on')
  const reg = await registration()
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) as BufferSource })
  await api.post('/push/subscribe', sub.toJSON())
}

/** Stop push on this browser and forget it on the account. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  try {
    await api.post('/push/unsubscribe', { endpoint: sub.endpoint })
  } finally {
    await sub.unsubscribe()
  }
}

/** On sign-in: re-save an existing subscription (keys may have rotated since). Never prompts. */
export async function syncPush(): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return
  const sub = await currentSubscription()
  if (sub) await api.post('/push/subscribe', sub.toJSON())
}

/** On sign-out: this browser should not keep receiving the previous account's notifications. */
export async function dropPushOnSignOut(): Promise<void> {
  try {
    await disablePush()
  } catch {}
}
