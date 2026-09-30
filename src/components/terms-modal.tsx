/** Terms & Conditions: full-text renderer, and the modal used on the create-account form. */
import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { FileText, X } from 'lucide-react'
import { TERMS, TERMS_EFFECTIVE, TERMS_VERSION } from '#/content/terms'
import { Button, cx } from './ui'

export function TermsBody({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cx('flex flex-col', compact ? 'gap-5' : 'gap-8')}>
      {TERMS.map((s) => (
        <section key={s.id} id={s.id} className="flex flex-col gap-2">
          <h2 className={compact ? 'text-[15px]' : 'text-xl'}>{s.title}</h2>
          {s.paragraphs.map((p, i) => <p key={i} className="m-0 text-[13px] leading-relaxed text-ink-2">{p}</p>)}
          {s.bullets && (
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13px] leading-relaxed text-ink-2">
              {s.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
        </section>
      ))}
      <p className="m-0 text-[11px] text-muted">Version {TERMS_VERSION} · effective {TERMS_EFFECTIVE} · @2026 UKO</p>
    </div>
  )
}

/** Scrollable modal; "I accept" only enables after the reader reaches the end. */
export function TermsModal({ open, onClose, onAccept }: { open: boolean; onClose: () => void; onAccept: () => void }) {
  const body = useRef<HTMLDivElement>(null)
  const [reachedEnd, setReachedEnd] = useState(false)
  useEffect(() => {
    if (!open) return
    setReachedEnd(false)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [open, onClose])
  if (!open) return null
  const onScroll = () => {
    const el = body.current
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReachedEnd(true)
  }
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-ink/50 p-0 md:items-center md:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="terms-title">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-lg bg-bg md:rounded-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-050 text-primary"><FileText size={17} /></span>
            <div className="flex flex-col">
              <h2 id="terms-title" className="text-[16px]">UKOshop Terms and Conditions</h2>
              <span className="text-[11px] text-muted">Version {TERMS_VERSION} · scroll to the end to accept</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-ink-2 hover:bg-surface"><X size={18} /></button>
        </div>
        <div ref={body} onScroll={onScroll} className="flex-1 overflow-y-auto px-5 py-4">
          <TermsBody compact />
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <Link to={'/terms' as any} target="_blank" className="text-[12px] font-semibold text-primary hover:underline">Open full page</Link>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Close</Button>
            <Button type="button" size="sm" disabled={!reachedEnd} onClick={() => { onAccept(); onClose() }}>{reachedEnd ? 'I accept the terms' : 'Read to the end to accept'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
