/**
 * MpesaPending — "enter your PIN" panel for a Daraja STK push.
 * Joins the sockets room "<MerchantRequestID>$<socket_key>" (the key the form sent with the push) so Daraja's callback reaches the browser, sends it to
 * POST /api/payments/mpesa/confirm (the API re-checks with Safaricom), and polls the status endpoint as a
 * fallback (simulation approves on the first poll; live mode asks Daraja after 30 s).
 */
import { useEffect, useRef, useState } from 'react'
import { CircleAlert, Smartphone, Wifi, WifiOff } from 'lucide-react'
import { api, ApiError } from '#/lib/api'
import { ksh } from '#/lib/format'
import { getSocket, waitForMpesaCallback, type StkCallback } from '#/lib/sockets'
import { Button, Notice, Spinner } from '#/components/ui'

export type MpesaPayment = {
  payment_id?: number | null
  order_id?: number | null
  merchant_request_id: string
  checkout_request_id: string
  socket_key?: string
  amount_ksh: number
  phone?: string
  message?: string
  simulated?: boolean
  expires_in?: number
  status?: string
}
export type MpesaResult = { status: string; receipt?: string; prompts_remaining?: number | null; confirmed_via?: string; error?: string | null; [k: string]: any }

const OK = new Set(['approved', 'paid', 'released'])
const KO = new Set(['cancelled', 'unpaid', 'failed'])

export function MpesaPending({ payment, title, onApproved, onFailed, onRetry, pollMs = 4000, timeoutS = 150 }: {
  payment: MpesaPayment
  title?: string
  onApproved: (r: MpesaResult) => void
  onFailed?: (message: string) => void
  onRetry?: () => void
  pollMs?: number
  timeoutS?: number
}) {
  const [seconds, setSeconds] = useState(timeoutS)
  const [socket, setSocket] = useState<'connecting' | 'connected' | 'callback' | 'confirming' | 'off'>(payment.merchant_request_id ? 'connecting' : 'off')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const done = useRef(false)
  const isOrder = !!payment.order_id

  const finish = (r: MpesaResult) => { if (done.current) return; done.current = true; onApproved(r) }
  const fail = (msg: string) => { if (done.current) return; done.current = true; setError(msg); onFailed?.(msg) }

  const poll = async (): Promise<MpesaResult | null> => {
    const r = isOrder
      ? await api.post<{ status: string; order: any }>(`/orders/${payment.order_id}/payment-status`)
      : await api.get<MpesaResult>(`/payments/mpesa/${payment.payment_id}`)
    if (OK.has(r.status)) { finish(r as MpesaResult); return r as MpesaResult }
    if (KO.has(r.status)) { fail((r as MpesaResult).error || 'The M-PESA payment was cancelled or declined'); return r as MpesaResult }
    return null
  }

  const confirm = async (cb: StkCallback) => {
    setSocket('confirming')
    try {
      const r = await api.post<MpesaResult>('/payments/mpesa/confirm', isOrder ? { order_id: payment.order_id, stk_callback: cb } : { payment_id: payment.payment_id, stk_callback: cb })
      if (OK.has(r.status)) finish(r)
      else if (KO.has(r.status)) fail(r.error || 'The M-PESA payment was cancelled or declined')
    } catch (e: any) {
      // 409 = Safaricom has not confirmed yet → keep polling; anything else is shown but polling continues too
      if (!(e instanceof ApiError && e.status === 409)) setError(e.message)
      setSocket('callback')
    }
  }

  useEffect(() => {
    done.current = false
    let waiter: { promise: Promise<StkCallback>; cancel: () => void } | null = null
    let offConnect: (() => void) | undefined
    if (payment.merchant_request_id) {
      const s = getSocket()
      const onC = () => setSocket((x) => (x === 'connecting' ? 'connected' : x))
      s.on('connect', onC)
      if (s.connected) setSocket('connected')
      waiter = waitForMpesaCallback(payment.merchant_request_id, payment.socket_key || '', { checkoutRequestId: payment.checkout_request_id, timeoutMs: timeoutS * 1000 })
      waiter.promise.then((cb) => { setSocket('callback'); confirm(cb) }).catch(() => {})
      offConnect = () => s.off('connect', onC)
    }
    const p = window.setInterval(() => { poll().catch(() => {}) }, pollMs)
    const t = window.setInterval(() => setSeconds((x) => {
      if (x <= 1) { window.clearInterval(t); fail('No confirmation from M-PESA in time — if you entered your PIN, the payment is applied as soon as the receipt arrives.'); return 0 }
      return x - 1
    }), 1000)
    // first poll straight away (simulation mode approves here)
    poll().catch(() => {})
    return () => { waiter?.cancel(); window.clearInterval(p); window.clearInterval(t); offConnect?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment.payment_id, payment.order_id, payment.merchant_request_id])

  const checkNow = async () => {
    setChecking(true)
    try { const r = await poll(); if (!r) setError('Still pending — enter your PIN on the phone.') } catch (e: any) { setError(e.message) } finally { setChecking(false) }
  }

  if (error && done.current) {
    return (
      <Notice tone="danger" icon={<CircleAlert size={14} />} title="Payment not completed" action={onRetry ? <Button type="button" size="sm" variant="outline" onClick={onRetry}>Try again</Button> : undefined}>{error}</Notice>
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-primary-300 bg-primary-050 p-3.5 text-[12px]">
      <div className="flex items-center gap-2.5">
        <Spinner />
        <div className="flex min-w-0 flex-col">
          <span className="text-[13px] font-bold text-ink">{title || 'Waiting for your M-PESA PIN'}</span>
          <span className="text-ink-2"><Smartphone size={12} className="mr-1 inline" />{payment.simulated ? 'Simulated push — approving…' : `Prompt sent to ${payment.phone || 'your phone'} for ${ksh(payment.amount_ksh)}. Enter your PIN to pay.`}</span>
        </div>
      </div>
      {payment.message && !payment.simulated && <span className="text-muted">{payment.message}</span>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span>Expires in {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>
        {payment.merchant_request_id && (
          <span className="inline-flex items-center gap-1">{socket === 'connecting' ? <WifiOff size={11} /> : <Wifi size={11} />}
            {socket === 'connecting' ? 'connecting to live updates…' : socket === 'connected' ? 'live updates on' : socket === 'callback' ? 'callback received' : socket === 'confirming' ? 'verifying with Safaricom…' : ''}</span>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={checkNow} loading={checking}>Check status</Button>
      </div>
      {error && <span className="text-danger">{error}</span>}
    </div>
  )
}
