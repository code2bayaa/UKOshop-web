/**
 * /mpesa-test — live STK push test harness:
 * push (with a random socket_key) → join the MerchantRequestID$key socket room on the UKO sockets server → receive Daraja's callback →
 * validate it with the shop API (POST /payments/mpesa/confirm) → payment approved and saved in credit_payments.
 */
import { useEffect, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CheckCircle2, CircleAlert, Radio as RadioIcon, Smartphone, Wifi, WifiOff } from 'lucide-react'
import { api, ApiError } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useToast } from '#/lib/toast'
import { fmtDate, ksh } from '#/lib/format'
import { SOCKETS_URL, getSocket, newSocketKey, waitForMpesaCallback, type SocketLog, type StkCallback } from '#/lib/sockets'
import { Button, Chip, Input, Notice, PageLoading, PageTitle, Select, StatusPill, cx } from '#/components/ui'
import { Panel, Table, Td } from '#/components/dashboard'

export const Route = createFileRoute('/mpesa-test')({ component: MpesaTestPage })

type Push = { payment_id: number; checkout_request_id: string; merchant_request_id: string; socket_key: string; status: string; amount_ksh: number; phone: string; message: string; simulated: boolean; expires_in: number }
type Payment = { payment_id: number; feature: string; amount_ksh: number; status: string; checkout_request_id: string; merchant_request_id: string; phone: string; receipt: string; confirmed_via: string; error?: string | null; created_at: string | null; prompts_remaining?: number | null; callback?: any }

function MpesaTestPage() {
  const { user, ready, refresh } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('1')
  const [purpose, setPurpose] = useState<'test' | 'ai_prompts'>('test')
  const [busy, setBusy] = useState(false)
  const [push, setPush] = useState<Push | null>(null)
  const [callback, setCallback] = useState<StkCallback | null>(null)
  const [result, setResult] = useState<Payment | null>(null)
  const [error, setError] = useState('')
  const [logs, setLogs] = useState<SocketLog[]>([])
  const [connected, setConnected] = useState(false)
  const [history, setHistory] = useState<Payment[]>([])
  const [seconds, setSeconds] = useState(0)
  const waiter = useRef<{ cancel: () => void } | null>(null)

  useEffect(() => { if (ready && !user) navigate({ to: '/signin' as any, search: { next: '/mpesa-test' } as any }) }, [ready, user, navigate])
  useEffect(() => { if (user && !phone) setPhone(user.profile.mpesa_number || user.telephone || '') }, [user]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user) return
    const s = getSocket()
    const on = () => setConnected(true)
    const offc = () => setConnected(false)
    s.on('connect', on); s.on('disconnect', offc)
    setConnected(s.connected)
    loadHistory()
    return () => { s.off('connect', on); s.off('disconnect', offc) }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!push || result || error) return
    const id = window.setInterval(() => setSeconds((x) => x + 1), 1000)
    return () => window.clearInterval(id)
  }, [push, result, error])

  const loadHistory = () => api.get<Payment[]>('/payments/mpesa', { limit: 10 }).then(setHistory).catch(() => {})
  const log = (l: SocketLog) => setLogs((ls) => [...ls, l].slice(-40))

  const start = async () => {
    setError(''); setCallback(null); setResult(null); setLogs([]); setSeconds(0)
    if (!phone.trim()) return toast.alert('Enter the M-PESA number to send the push to')
    setBusy(true)
    try {
      const socketKey = newSocketKey()
      const p = await api.post<Push>('/payments/mpesa/push', { purpose, phone: phone.trim(), amount: purpose === 'test' ? Number(amount) || 1 : undefined, socket_key: socketKey })
      setPush(p)
      log({ at: new Date().toISOString(), event: 'stk push', detail: `MerchantRequestID ${p.merchant_request_id} · CheckoutRequestID ${p.checkout_request_id}${p.simulated ? ' (simulated)' : ''}` })
      toast.success(p.simulated ? 'Simulated push created — use "Simulate Daraja callback" below' : `M-PESA prompt sent to ${p.phone}`)
      const w = waitForMpesaCallback(p.merchant_request_id, p.socket_key || socketKey, { onLog: log, checkoutRequestId: p.checkout_request_id, timeoutMs: 180000 })
      waiter.current = w
      w.promise.then((cb) => confirmCallback(p, cb)).catch((e) => { if (!result) setError(e.message) })
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : 'Push failed')
    } finally {
      setBusy(false)
    }
  }

  const confirmCallback = async (p: Push, cb: StkCallback) => {
    setCallback(cb)
    log({ at: new Date().toISOString(), event: 'validating with API', detail: `POST /payments/mpesa/confirm · ResultCode ${cb.ResultCode}` })
    try {
      const r = await api.post<Payment & { validated: boolean }>('/payments/mpesa/confirm', { payment_id: p.payment_id, stk_callback: cb })
      setResult(r)
      log({ at: new Date().toISOString(), event: r.status === 'approved' ? 'approved' : r.status, detail: `saved to credit_payments #${r.payment_id} · ${r.confirmed_via}${r.receipt ? ` · receipt ${r.receipt}` : ''}` })
      if (r.status === 'approved') toast.success(`Payment approved · KSh ${r.amount_ksh} · receipt ${r.receipt || 'n/a'}`)
      else toast.alert(r.error || 'Payment was not completed')
      refresh(); loadHistory()
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : 'Validation failed'
      setError(msg)
      log({ at: new Date().toISOString(), event: 'validation failed', detail: msg })
      toast.alert(msg)
    }
  }

  /** Simulation helper (no Daraja keys): feed a sample stkCallback through the same confirm path. */
  const simulateCallback = () => {
    if (!push) return
    waiter.current?.cancel()
    confirmCallback(push, {
      MerchantRequestID: push.merchant_request_id, CheckoutRequestID: push.checkout_request_id, ResultCode: 0, ResultDesc: 'The service request is processed successfully.',
      CallbackMetadata: { Item: [{ Name: 'Amount', Value: push.amount_ksh }, { Name: 'MpesaReceiptNumber', Value: 'SIM' + Math.random().toString(36).slice(2, 9).toUpperCase() }, { Name: 'TransactionDate', Value: Number(new Date().toISOString().replace(/\D/g, '').slice(0, 14)) }, { Name: 'PhoneNumber', Value: Number(push.phone) }] },
    })
  }

  const pollNow = async () => {
    if (!push) return
    try {
      const r = await api.get<Payment>(`/payments/mpesa/${push.payment_id}`)
      if (r.status !== 'pending') { waiter.current?.cancel(); setResult(r); refresh(); loadHistory(); log({ at: new Date().toISOString(), event: `poll → ${r.status}`, detail: r.confirmed_via }) }
      else toast.toast('Still pending — waiting for the PIN / callback')
    } catch (e: any) { toast.error(e.message) }
  }

  if (!ready || !user) return <PageLoading />
  const items = callback?.CallbackMetadata?.Item || []
  return (
    <div className="container-x flex flex-col gap-6 py-8 md:py-10">
      <PageTitle title="M-PESA STK push test" sub="Push → sockets room (MerchantRequestID$key) → signed Daraja callback → validated by the shop API → saved to credit_payments → approved"
        action={<Chip tone={connected ? 'success' : 'warning'}>{connected ? <Wifi size={12} /> : <WifiOff size={12} />} sockets {connected ? 'connected' : 'connecting…'} · {SOCKETS_URL.replace('https://', '')}</Chip>} />
      <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
        <Panel title="1 · Send the push" sub="Daraja sandbox needs a registered test number; live needs a real Safaricom line">
          <div className="flex flex-col gap-3.5">
            <Select label="Purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as any)}>
              <option value="test">Test payment (KSh 1)</option>
              <option value="ai_prompts">Buy 5 AI prompts (KSh 500)</option>
            </Select>
            <Input label="M-PESA number" placeholder="07xx xxx xxx" value={phone} onChange={(e) => setPhone(e.target.value)} leading={<Smartphone size={15} />} />
            {purpose === 'test' && <Input label="Amount (KSh)" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />}
            <Button onClick={start} loading={busy} icon={<RadioIcon size={15} />}>Send STK push</Button>
            {push && (
              <div className="flex flex-col gap-1 rounded-md border border-border bg-surface px-3 py-2.5 text-[12px]">
                <span className="font-semibold text-ink">Push #{push.payment_id} · {ksh(push.amount_ksh)} → {push.phone}</span>
                <span className="text-ink-2">MerchantRequestID (room): <code className="text-ink">{push.merchant_request_id}</code></span>
                <span className="text-ink-2">CheckoutRequestID: <code className="text-ink">{push.checkout_request_id}</code></span>
                <span className="text-muted">{push.message}</span>
                {!result && !error && <span className="text-primary">Waiting for the callback… {seconds}s</span>}
                <div className="mt-1 flex flex-wrap gap-2">
                  {push.simulated && <Button size="sm" variant="outline" onClick={simulateCallback}>Simulate Daraja callback</Button>}
                  <Button size="sm" variant="ghost" onClick={pollNow}>Check status now</Button>
                </div>
              </div>
            )}
            {error && <Notice tone="danger" icon={<CircleAlert size={14} />}>{error}</Notice>}
            {result && (
              <Notice tone={result.status === 'approved' ? 'success' : 'danger'} icon={result.status === 'approved' ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />} title={result.status === 'approved' ? 'Payment approved' : `Payment ${result.status}`}>
                credit_payments #{result.payment_id} · {ksh(result.amount_ksh)} · {result.receipt ? `receipt ${result.receipt} · ` : ''}{result.confirmed_via}
                {result.feature === 'ai_prompts' && result.prompts_remaining != null ? ` · prompts now ${result.prompts_remaining}` : ''}
              </Notice>
            )}
          </div>
        </Panel>
        <div className="flex flex-col gap-5">
          <Panel title="2 · Socket events" sub={`socket.emit('user', MerchantRequestID + '$' + key) then listen for 'callback'`} padded={false}>
            <div className="max-h-64 overflow-y-auto px-4 py-3 font-mono text-[11px]">
              {logs.length === 0 ? <span className="text-muted">No events yet.</span> : logs.map((l, i) => (
                <div key={i} className="flex gap-2 py-0.5"><span className="shrink-0 text-muted">{l.at.slice(11, 19)}</span><span className={cx('shrink-0 font-semibold', l.event.includes('fail') || l.event.includes('error') ? 'text-danger' : l.event === 'approved' ? 'text-success' : 'text-primary')}>{l.event}</span><span className="break-all text-ink-2">{l.detail}</span></div>
              ))}
            </div>
          </Panel>
          <Panel title="3 · Callback received" sub="Exactly what Daraja sent to the sockets server (before validation)">
            {callback ? (
              <div className="grid gap-2 text-[12px] sm:grid-cols-2">
                <span><b>ResultCode</b> {callback.ResultCode} · {callback.ResultDesc}</span>
                {items.map((it) => <span key={it.Name}><b>{it.Name}</b> {String(it.Value)}</span>)}
              </div>
            ) : <span className="text-[12px] text-muted">Nothing received yet.</span>}
          </Panel>
        </div>
      </div>
      <Panel title="Recent M-PESA payments (credit_payments)" padded={false}>
        <Table head={['#', 'Purpose', 'Amount', 'Phone', 'Checkout / Merchant', 'Receipt', 'Confirmed via', 'Status', 'When']}>
          {history.map((p) => (
            <tr key={p.payment_id}>
              <Td>{p.payment_id}</Td><Td>{p.feature}</Td><Td>{ksh(p.amount_ksh)}</Td><Td>{p.phone}</Td>
              <Td className="font-mono text-[11px]">{p.checkout_request_id}<br />{p.merchant_request_id}</Td>
              <Td>{p.receipt || '—'}</Td><Td>{p.confirmed_via || '—'}</Td><Td><StatusPill status={p.status} /></Td><Td className="text-muted">{fmtDate(p.created_at)}</Td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  )
}
