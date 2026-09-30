/** Contact & complaints — /contact */
import { useState, type FormEvent } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Bike, Clock, Mail, MapPin, MessageSquare, Phone, Send, Store, Tag, Truck } from 'lucide-react'
import { api } from '#/lib/api'
import { useToast } from '#/lib/toast'
import { Button, Card, Input, Notice, Select, Textarea, cx } from '#/components/ui'

export const Route = createFileRoute('/contact')({ component: ContactPage })

/** Who the complaint is about. Staff see complaints filed under these in the admin console's Disputes tab. */
const CATEGORIES = [
  { key: 'delivery', label: 'Delivery', hint: 'A rider or a delivery to your door', icon: Bike },
  { key: 'seller', label: 'Seller', hint: 'An item, an ad or a seller', icon: Tag },
  { key: 'shelve', label: 'Shelve', hint: 'A shelf or its host', icon: Store },
  { key: 'courier', label: 'Courier', hint: 'A parcel sent between towns', icon: Truck },
] as const

const SUBJECTS = ['Order or delivery problem', 'Payment / escrow / refund', 'Item not as described', 'Shelf host feedback', 'Rider feedback', 'Account or sign-in', 'Something else']

function ContactPage() {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', email: '', category: '', subject: '', body: '' })
  const [errors, setErrors] = useState<Partial<typeof form>>({})
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Partial<typeof form> = {}
    if (form.name.trim().length < 2) errs.name = 'Enter your name'
    if (!form.category) errs.category = 'Choose what your complaint is about'
    if (!form.subject) errs.subject = 'Choose a subject'
    if (form.body.trim().length < 5) errs.body = 'Tell us a bit more (at least 5 characters)'
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Enter a valid email'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      await api.post('/complaints', { name: form.name.trim(), category: form.category, subject: form.subject, body: form.body.trim(), email: form.email.trim() })
      toast.success('Thanks — we received your message and will reply within one working day.')
      setSent(true)
      setForm({ name: '', email: '', category: '', subject: '', body: '' })
    } catch (err: any) {
      toast.error(err?.message || 'Could not send your message. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col pb-6">
      <div className="w-full border-b border-border bg-surface">
        <div className="container-x flex flex-col gap-1.5 py-6 md:py-8">
          <h1 className="text-[26px] leading-tight md:text-[30px]">Contact us</h1>
          <p className="m-0 max-w-xl text-sm text-ink-2">Stuck with an order, a shelf, or a payment? Tell us what happened — every complaint is read by a person, not a bot.</p>
        </div>
      </div>

      <div className="container-x grid gap-6 pt-6 md:grid-cols-[320px_1fr] md:gap-8 md:pt-8">
        {/* Details */}
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <h2 className="text-lg">Reach us directly</h2>
            <a href="mailto:support@uko-app.co.ke" className="flex items-start gap-3 hover:text-primary">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-050 text-primary"><Mail size={18} /></span>
              <span className="flex flex-col gap-0.5"><span className="text-[13px] font-bold text-ink">Email</span><span className="text-xs text-ink-2">support@uko.co.ke</span></span>
            </a>
            <a href="tel:0717323852" className="flex items-start gap-3 hover:text-primary">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-050 text-primary"><Phone size={18} /></span>
              <span className="flex flex-col gap-0.5"><span className="text-[13px] font-bold text-ink">Phone / WhatsApp</span><span className="text-xs text-ink-2">0717323852</span></span>
            </a>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-050 text-primary"><MapPin size={18} /></span>
              <span className="flex flex-col gap-0.5"><span className="text-[13px] font-bold text-ink">Office</span><span className="text-xs text-ink-2">Kilimani, Nairobi, Kenya</span></span>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-050 text-primary"><Clock size={18} /></span>
              <span className="flex flex-col gap-0.5"><span className="text-[13px] font-bold text-ink">Support hours</span><span className="text-xs text-ink-2">Mon – Sat · 08:00 – 17:00 EAT</span></span>
            </div>
          </Card>
          <div className="grad-soft flex flex-col gap-2 rounded-lg p-5">
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink"><MessageSquare size={14} className="text-primary" /> Looking for a quick answer?</span>
            <p className="m-0 text-xs text-ink-2">Escrow, claim codes, the 24-hour hold and refunds are all explained in the help centre.</p>
            <Link to={'/help' as any} className="text-[13px] font-semibold text-primary hover:underline">Open help centre →</Link>
          </div>
        </div>

        {/* Complaint form */}
        <Card className="flex flex-col gap-5 md:p-7">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg">Send a complaint or message</h2>
            <p className="m-0 text-[13px] text-ink-2">Include your order number or shelf name if you have one — it speeds things up.</p>
          </div>
          {sent && <Notice tone="success" title="Message received">We reply within one working day. Urgent delivery issues: call 0700 000 000.</Notice>}
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Your name" required placeholder="Jane Wanjiru" value={form.name} onChange={set('name')} error={errors.name} autoComplete="name" />
              <Input label="Email" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} error={errors.email} hint="Optional — so we can reply" autoComplete="email" />
            </div>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Category">
              <span className="text-xs font-semibold text-ink-2">What is it about? <span className="text-danger">*</span></span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CATEGORIES.map((c) => {
                  const on = form.category === c.key
                  const Icon = c.icon
                  return (
                    <button
                      key={c.key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => { setForm((f) => ({ ...f, category: c.key })); setErrors((e) => ({ ...e, category: undefined })) }}
                      className={cx('flex flex-col items-start gap-1 rounded-md border px-3 py-2.5 text-left transition-colors', on ? 'border-primary bg-primary-050' : 'border-border bg-bg hover:border-border-strong')}
                    >
                      <span className={cx('flex items-center gap-1.5 text-[13px] font-bold', on ? 'text-primary' : 'text-ink')}><Icon size={15} /> {c.label}</span>
                      <span className="text-[11px] leading-snug text-muted">{c.hint}</span>
                    </button>
                  )
                })}
              </div>
              {errors.category && <span className="text-[11px] text-danger">{errors.category}</span>}
            </div>
            <Select label="Subject" required placeholder="Choose a subject" value={form.subject} onChange={set('subject')} error={errors.subject}>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Textarea label="Message" required rows={6} placeholder="What happened, when, and which order or shelf it concerns." value={form.body} onChange={set('body')} error={errors.body} maxLength={999} hint={`${form.body.length} / 999`} />
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[11px] text-muted">We never share your details with sellers or shelf hosts.</span>
              <Button type="submit" loading={busy} icon={<Send size={15} />}>Send message</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
