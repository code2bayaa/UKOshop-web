/**
 * Shared polling for the badge stores (notifications, messages) so a count that arrives while the
 * user is on some other page still reaches the icon. Paused while the tab is hidden — a backgrounded
 * tab has no badge to show and should not keep hitting the API — and re-checked the moment he comes
 * back to it, which is when a stale number would actually be noticed.
 */
import { useEffect } from 'react'

export const BADGE_POLL_MS = 30000

export function usePolledRefresh(refresh: () => void, ms: number = BADGE_POLL_MS) {
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) refresh()
    }
    const timer = window.setInterval(tick, ms)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [refresh, ms])
}
