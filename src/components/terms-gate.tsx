/** Asks a signed-in account to accept the terms again whenever TERMS_VERSION moves past the version it accepted
 *  (terms s. 20). Nothing else on the page can be used until it does — accept, or sign out. */
import { useRef, useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import { FileText, LogOut } from 'lucide-react'
import { TERMS_EFFECTIVE, TERMS_VERSION } from '#/content/terms'
import { api, type User } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useToast } from '#/lib/toast'
import { TermsBody } from './terms-modal'
import { Button } from './ui'

export function TermsGate() {
  const { user, setUser, logout } = useAuth()
  const { pathname } = useLocation()
  const toast = useToast()
  const body = useRef<HTMLDivElement>(null)
  const [reachedEnd, setReachedEnd] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!user || pathname === '/terms' || user.profile?.terms_version === TERMS_VERSION) return null

  const onScroll = () => {
    const el = body.current
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReachedEnd(true)
  }
  const accept = async () => {
    setBusy(true)
    try {
      setUser(await api.post<User>('/auth/accept-terms', { accept_terms: true, terms_version: TERMS_VERSION }))
      toast.success('Thanks. You have accepted the updated terms')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-ink/60 p-0 md:items-center md:p-6" role="dialog" aria-modal="true" aria-labelledby="terms-gate-title">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-lg bg-bg md:rounded-lg">
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-050 text-primary"><FileText size={17} /></span>
          <div className="flex flex-col">
            <h2 id="terms-gate-title" className="text-[16px]">We've updated the UKOshop Terms and Conditions</h2>
            <span className="text-[11px] text-muted">Version {TERMS_VERSION} · effective {TERMS_EFFECTIVE}</span>
          </div>
        </div>
        <div className="border-b border-border bg-primary-050 px-5 py-3 text-[12.5px] leading-relaxed text-ink-2">
          <strong className="text-ink">What changed:</strong> sellers can send you marketing by e-mail and SMS once you have paid for an order
          (section 12), and you can now switch push, SMS and e-mail notifications from sellers, shelves, riders and couriers on or off under
          Account → Settings. Notices from UKO admin are always sent (section 13A). Everything is on until you change it.
        </div>
        <div ref={body} onScroll={onScroll} className="flex-1 overflow-y-auto px-5 py-4">
          <TermsBody compact />
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="outline" size="sm" icon={<LogOut size={14} />} onClick={() => logout()}>Sign out</Button>
          <Button type="button" size="sm" disabled={!reachedEnd || busy} loading={busy} onClick={accept}>
            {reachedEnd ? 'I accept the terms' : 'Read to the end to accept'}
          </Button>
        </div>
      </div>
    </div>
  )
}
