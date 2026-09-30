/**
 * Create account component — registration form with e-mail validation.
 * "Validate email" sits under the e-mail input: POST /api/auth/otp/send (smtplib, sender "UKO",
 * subject "VERIFY EMAIL") → 6-digit code → POST /api/auth/otp/verify → token passed to /api/auth/register.
 * (OtpField also supports channel "sms" via Africa's Talking for other screens.)
 * Password policy: 8+ chars, a capital letter, a special character, at least 4 digits (mirrored in the API).
 * Country, county and ward are required — the lists come from GET /api/locations (app/locations.py);
 * a county we have no list for is typed in, and any ward may be typed in (the list is only suggestions).
 * Empty / invalid fields raise a centre-top alert toast.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { BadgeCheck, CheckCircle2, Circle, CircleAlert, Eye, EyeOff, Mail, MessageSquare, RefreshCw } from 'lucide-react'
import { api, ApiError, type Locations, type User } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useToast } from '#/lib/toast'
import { Button, Checkbox, Chip, CodeDigits, Input, Notice, Select, cx } from '#/components/ui'
import { TermsModal } from '#/components/terms-modal'
import { GoogleSignInButton } from '#/components/google-button'
import { TERMS_VERSION } from '#/content/terms'

type Channel = 'email' | 'sms'
type OtpState = { status: 'idle' | 'sending' | 'sent' | 'verifying' | 'verified'; target: string; expiresAt: number; token: string; demo?: string; error?: string }
const IDLE: OtpState = { status: 'idle', target: '', expiresAt: 0, token: '' }

function fmt(secs: number) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Input + "Validate …" button + code entry with a 20-minute countdown. Reusable for e-mail and phone. */
export function OtpField({ channel, label, value, onChange, placeholder, autoComplete, required, state, onState, hint, error, purpose = 'register' }: {
  channel: Channel; label: string; value: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: string; required?: boolean
  state: OtpState; onState: (s: OtpState) => void; hint?: string; error?: string; purpose?: string
}) {
  const toast = useToast()
  const [code, setCode] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const timer = useRef<number | null>(null)
  const verified = state.status === 'verified' && state.target === value.trim()
  const sent = (state.status === 'sent' || state.status === 'verifying') && state.target === value.trim()
  const remaining = Math.max(0, Math.floor((state.expiresAt - now) / 1000))
  const expired = sent && remaining === 0

  useEffect(() => {
    if (!sent) return
    timer.current = window.setInterval(() => setNow(Date.now()), 1000)
    return () => { if (timer.current) window.clearInterval(timer.current) }
  }, [sent])

  const valid = channel === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) : value.replace(/\D/g, '').length >= 9

  const send = async () => {
    if (!value.trim()) return toast.alert(`${label} must not be empty`)
    if (!valid) {
      const msg = channel === 'email' ? 'Enter a valid email address first' : 'Enter a valid phone number first'
      toast.alert(msg)
      return onState({ ...IDLE, error: msg })
    }
    onState({ ...IDLE, status: 'sending', target: value.trim() })
    try {
      const r = await api.post<{ sent: boolean; expires_in: number; demo_otp?: string; note?: string }>('/auth/otp/send', { channel, target: value.trim(), purpose })
      setCode('')
      onState({ status: 'sent', target: value.trim(), expiresAt: Date.now() + r.expires_in * 1000, token: '', demo: r.demo_otp })
      toast.success(channel === 'email' ? `Verification code sent to ${value.trim()} — check your inbox (subject: VERIFY EMAIL)` : `Verification code sent by SMS to ${value.trim()}`)
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : 'Could not send the code'
      toast.alert(msg)
      onState({ ...IDLE, error: msg })
    }
  }

  const verify = async (c: string) => {
    onState({ ...state, status: 'verifying', error: undefined })
    try {
      const r = await api.post<{ verified: boolean; token: string }>('/auth/otp/verify', { channel, target: value.trim(), code: c, purpose })
      onState({ status: 'verified', target: value.trim(), expiresAt: 0, token: r.token })
      toast.success(channel === 'email' ? 'Email verified' : 'Phone number verified')
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : 'Could not verify the code'
      toast.alert(msg)
      onState({ ...state, status: 'sent', error: msg })
    }
  }

  useEffect(() => {
    if (sent && code.length === 6 && state.status !== 'verifying') verify(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  return (
    <div className="flex flex-col gap-2">
      <Input
        label={label}
        required={required}
        type={channel === 'email' ? 'email' : 'tel'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); if (state.status !== 'idle' && e.target.value.trim() !== state.target) onState(IDLE) }}
        trailing={verified ? <BadgeCheck size={16} className="text-success" /> : undefined}
        hint={hint}
        error={error}
      />
      {/* Validate button — sits at the bottom of the input */}
      {!verified && !sent && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" loading={state.status === 'sending'} onClick={send} icon={channel === 'email' ? <Mail size={14} /> : <MessageSquare size={14} />}>
            {channel === 'email' ? 'Validate email' : 'Validate phone'}
          </Button>
          <span className="text-[11px] text-muted">{channel === 'email' ? 'We e-mail a 6-digit code from UKO · expires in 20 minutes' : 'We text a 6-digit code · expires in 20 minutes'}</span>
        </div>
      )}
      {verified && <Chip size="sm" tone="success"><BadgeCheck size={12} /> {channel === 'email' ? 'Email verified' : 'Phone verified'}</Chip>}
      {sent && (
        <div className={cx('flex flex-col gap-2.5 rounded-md border px-3.5 py-3', expired ? 'border-danger/30 bg-danger-050' : 'border-primary-300 bg-primary-050')}>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
            <span className="text-ink-2">Enter the 6-digit code sent to <span className="font-semibold text-ink">{state.target}</span></span>
            <span className={cx('font-semibold tabular-nums', expired ? 'text-danger' : 'text-primary')}>{expired ? 'Code expired' : `Expires in ${fmt(remaining)}`}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <CodeDigits value={code} length={6} onChange={setCode} size="sm" />
            {state.status === 'verifying' && <span className="text-[11px] text-ink-2">Checking…</span>}
            <button type="button" onClick={send} className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"><RefreshCw size={11} /> Resend code</button>
          </div>
          {state.demo && <span className="text-[11px] text-muted">Test mode (no {channel === 'email' ? 'SMTP' : "Africa's Talking"} credentials in .env) — your code is <b className="text-ink">{state.demo}</b></span>}
        </div>
      )}
      {state.error && <span className="flex items-center gap-1 text-[11px] text-danger"><CircleAlert size={12} /> {state.error}</span>}
    </div>
  )
}

// ---------------------------------------------------------------- password policy (mirrored in back-end schemas.check_password_strength)
export const PASSWORD_RULES = [
  { key: 'length', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { key: 'upper', label: 'At least one capital letter (A–Z)', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'special', label: 'At least one special character (!@#$%^&*…)', test: (p: string) => /[^A-Za-z0-9\s]/.test(p) },
  { key: 'digits', label: 'At least 4 number digits (0–9)', test: (p: string) => (p.match(/\d/g) || []).length >= 4 },
] as const

export function passwordProblems(p: string): string[] {
  return PASSWORD_RULES.filter((r) => !r.test(p)).map((r) => r.label)
}

export function PasswordRules({ value }: { value: string }) {
  const strength = PASSWORD_RULES.filter((r) => r.test(value)).length
  const tone = strength === 4 ? 'bg-success' : strength >= 2 ? 'bg-warning' : 'bg-danger'
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-bg px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div className="flex h-1.5 flex-1 gap-1">
          {[0, 1, 2, 3].map((i) => <span key={i} className={cx('h-full flex-1 rounded-full', i < strength ? tone : 'bg-surface-2')} />)}
        </div>
        <span className="text-[11px] font-semibold text-ink-2">{strength === 4 ? 'Strong' : strength >= 2 ? 'Getting there' : 'Weak'}</span>
      </div>
      <ul className="m-0 grid list-none gap-1 p-0 sm:grid-cols-2">
        {PASSWORD_RULES.map((r) => {
          const ok = r.test(value)
          return (
            <li key={r.key} className={cx('flex items-center gap-1.5 text-[11px]', ok ? 'text-success' : 'text-ink-2')}>
              {ok ? <CheckCircle2 size={12} /> : <Circle size={12} className="text-border-strong" />} {r.label}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const FIELD_LABEL: Record<string, string> = { name: 'Full name', email: 'Email', country: 'Country', county: 'County', ward: 'Ward', password: 'Password', confirm: 'Confirm password' }
const NO_PLACES: Locations = { countries: ['Kenya'], default_country: 'Kenya', counties: {}, wards: {} }

export function CreateAccountForm({ onDone, next, title = 'Create account', sub = 'Takes a minute. You need it to post ads, buy, or host a shelf.' }: {
  onDone?: (user: User) => void; next?: string; title?: string; sub?: string
}) {
  const { register, loginWithGoogle } = useAuth()
  const toast = useToast()
  const [f, setF] = useState({ name: '', email: '', country: '', county: '', ward: '', password: '', confirm: '' })
  const [places, setPlaces] = useState<Locations>(NO_PLACES)
  const wardListId = useId()
  const [email, setEmail] = useState<OtpState>(IDLE)
  const [agree, setAgree] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))

  useEffect(() => {
    api.get<Locations>('/locations')
      .then((r) => { setPlaces(r); setF((s) => (s.country ? s : { ...s, country: r.default_country })) })
      .catch(() => setF((s) => (s.country ? s : { ...s, country: NO_PLACES.default_country })))
  }, [])

  // A country we have no county list for is typed in; wards are always suggestions, never a closed list.
  const counties = places.counties[f.country] || []
  const wardHints = places.wards[f.county] || []
  const setCountry = (v: string) => setF((s) => ({ ...s, country: v, county: '', ward: '' }))
  const setCounty = (v: string) => setF((s) => ({ ...s, county: v, ward: '' }))

  const mismatch = f.confirm.length > 0 && f.confirm !== f.password
  const emailOk = email.status === 'verified' && email.target === f.email.trim()
  const problems = passwordProblems(f.password)
  const empty = (k: keyof typeof f) => touched && !f[k].trim()

  /** Validate in field order; the first failure is shown as a centre-top alert. */
  const validate = (): string => {
    for (const k of ['name', 'email', 'country', 'county', 'ward', 'password', 'confirm'] as const) {
      if (!f[k].trim()) return k === 'country' || k === 'county' || k === 'ward' ? `Choose your ${FIELD_LABEL[k].toLowerCase()}` : `${FIELD_LABEL[k]} must not be empty`
      if (k === 'email' && !emailOk) return 'Email must be verified — click "Validate email" and enter the code'
      if (k === 'password' && problems.length) return `Password is not strong enough: ${problems[0].toLowerCase()}`
      if (k === 'confirm' && f.confirm !== f.password) return 'Passwords do not match'
    }
    if (!agree) return 'You must accept the UKOshop Terms and Conditions to create an account'
    return ''
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    setError('')
    const problem = validate()
    if (problem) {
      toast.alert(problem)
      setError(problem)
      return
    }
    setBusy(true)
    try {
      const u = await register({ name: f.name.trim(), email: f.email.trim(), phone: '', password: f.password, country: f.country.trim(), county: f.county.trim(), ward: f.ward.trim(), email_token: email.token, accept_terms: agree, terms_version: TERMS_VERSION })
      toast.success(`Welcome to UKO, ${u.name.split(' ')[0]}.`)
      onDone?.(u)
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : 'Could not create your account. Try again.'
      toast.alert(msg)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-1 flex-col gap-3.5 rounded-lg border border-border bg-surface p-5 md:p-[26px]">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">{title}</h1>
        <p className="m-0 text-xs text-ink-2">{sub}</p>
      </div>
      <Input label="Full name" required autoComplete="name" placeholder="Brian Wekesa" value={f.name} onChange={(e) => set('name')(e.target.value)} error={empty('name') ? 'Full name must not be empty' : undefined} />
      <OtpField channel="email" label="Email" required autoComplete="email" placeholder="you@example.com" value={f.email} onChange={set('email')} state={email} onState={setEmail}
        error={empty('email') ? 'Email must not be empty' : touched && !emailOk ? 'Email must be verified before you register' : undefined} />
      <div className="grid gap-3.5 sm:grid-cols-3">
        <Select label="Country" required placeholder="Select country" value={f.country} onChange={(e) => setCountry(e.target.value)}
          error={empty('country') ? 'Choose your country' : undefined}>
          {places.countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        {counties.length ? (
          <Select label="County" required placeholder="Select county" value={f.county} onChange={(e) => setCounty(e.target.value)}
            hint={f.country === 'Kenya' ? 'Your county' : undefined} error={empty('county') ? 'Choose your county' : undefined}>
            {counties.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        ) : (
          <Input label="County" required placeholder="County / province" value={f.county} onChange={(e) => setCounty(e.target.value)}
            error={empty('county') ? 'Choose your county' : undefined} />
        )}
        <Input label="Ward" required list={wardListId} placeholder={wardHints[0] ? `e.g. ${wardHints[0]}` : 'Your ward'} value={f.ward}
          onChange={(e) => set('ward')(e.target.value)} hint={wardHints.length ? 'Pick one or type yours' : undefined}
          error={empty('ward') ? 'Choose your ward' : undefined} />
        <datalist id={wardListId}>{wardHints.map((w) => <option key={w} value={w} />)}</datalist>
      </div>
      <div className="flex flex-col gap-2">
        <Input label="Password" required type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="e.g. Uko@2026shop" value={f.password} onChange={(e) => set('password')(e.target.value)}
          error={empty('password') ? 'Password must not be empty' : touched && problems.length ? 'Password does not meet the rules below' : undefined}
          trailing={<button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)} className="text-muted hover:text-ink">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>} />
        <PasswordRules value={f.password} />
      </div>
      <Input label="Confirm password" required type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="Repeat your password" value={f.confirm} onChange={(e) => set('confirm')(e.target.value)}
        error={empty('confirm') ? 'Confirm password must not be empty' : mismatch ? 'Passwords do not match' : undefined} />
      <Checkbox checked={agree} onChange={setAgree} label={<span className="text-[11px] leading-relaxed">I have read and agree to the <button type="button" onClick={() => setTermsOpen(true)} className="font-semibold text-primary hover:underline">UKOshop Terms and Conditions</button> — including the 20% commission on items sold through a shelve, escrow and claim codes, barter inspection, that direct orders are at my own risk, and the use of my data and location for order tracing, recommendations and personalised ads.</span>} />
      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} onAccept={() => setAgree(true)} />
      <Button type="submit" variant="secondary" size="lg" full loading={busy}>Register</Button>
      <div className="flex items-center gap-3 text-[11px] text-muted"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
      <GoogleSignInButton
        text="signup_with"
        hint={agree ? 'Creates your UKO account with your Google e-mail (already verified by Google) — fill in country, county and ward above first.' : 'Tick the Terms and Conditions box above first.'}
        onCredential={async (idToken) => {
          if (!agree) { toast.alert('You must accept the UKOshop Terms and Conditions to create an account'); return }
          for (const k of ['country', 'county', 'ward'] as const) {
            if (!f[k].trim()) { toast.alert(`Choose your ${FIELD_LABEL[k].toLowerCase()}`); setTouched(true); return }
          }
          setBusy(true)
          try {
            const { user: u, created } = await loginWithGoogle(idToken, { accept_terms: true, terms_version: TERMS_VERSION, country: f.country.trim(), county: f.county.trim(), ward: f.ward.trim() })
            toast.success(created ? `Welcome to UKO, ${u.name.split(' ')[0]}.` : `Signed in as ${u.name}`)
            onDone?.(u)
          } catch (err: any) {
            const msg = err instanceof ApiError ? err.message : 'Google sign-up failed. Try again.'
            toast.alert(msg)
            setError(msg)
          } finally {
            setBusy(false)
          }
        }}
      />
      <p className="m-0 text-[11px] text-muted">Your e-mail must be verified and the terms accepted before the account is created. Codes expire after 20 minutes.</p>
      {error && <Notice tone="danger" icon={<CircleAlert size={14} />}><span className="text-danger">{error}</span></Notice>}
      <p className="m-0 text-center text-xs text-ink-2">
        Already have an account? <Link to="/signin" search={{ next } as any} className="font-semibold text-primary-600 hover:underline">Sign in</Link>
      </p>
    </form>
  )
}
