/**
 * Profile — /profile, the account's own details, reached from the menu right after Orders.
 *
 * Everything here is editable except one thing: the contact e-mail. That address is what this account
 * signs in with, so it only moves through the OTP flow (seller dashboard → Profile & account → Change
 * email · POST /auth/change-email). In its place the owner keeps up to five extra addresses — copies-to
 * for receipts and order mail, nothing signs in with them.
 *
 * The M-PESA number is the one the checkout prompt is sent to: the API charges
 * `mpesa_number or telephone` (app/routers/orders.py pay), and the payment page shows the same.
 */
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ImagePlus, Lock, Mail, Plus, Smartphone, Trash2, UserRound } from 'lucide-react'
import { api, type ExtraEmail, type Locations, type User } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useToast } from '#/lib/toast'
import { Avatar, Button, Card, Chip, Input, LinkButton, Notice, PageLoading, SectionHead, Select, cx } from '#/components/ui'

export const Route = createFileRoute('/profile')({ component: ProfilePage })

const MAX_EXTRA_EMAILS = 5   // app/routers/auth.py MAX_EXTRA_EMAILS
const NO_PLACES: Locations = { countries: ['Kenya'], default_country: 'Kenya', counties: {}, wards: {} }
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/

/** 0712 345 678 · +254 712 345 678 · 254712345678 all reach the same line (app/mpesa.py normalise_msisdn). */
function msisdn(phone: string): string {
  const p = phone.replace(/\D/g, '')
  if (p.startsWith('254')) return p
  if (p.startsWith('0')) return '254' + p.slice(1)
  if (p.startsWith('7') || p.startsWith('1')) return '254' + p
  return p
}
const isMpesaNumber = (phone: string) => msisdn(phone).length === 12 && msisdn(phone).startsWith('254')
/** 254712345678 → 0712 345 678, so a saved number reads back the way people write it. */
const prettyPhone = (phone: string) => {
  const m = msisdn(phone)
  if (m.length !== 12) return phone
  const local = '0' + m.slice(3)
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
}

type Form = {
  first_name: string; last_name: string; store_name: string; telephone: string; mpesa_number: string
  country: string; county: string; ward: string; location: string; birthday: string; gender: string
}

const formOf = (u: User): Form => ({
  first_name: u.profile.first_name || '', last_name: u.profile.last_name || '', store_name: u.profile.store_name || '',
  telephone: u.telephone || '', mpesa_number: u.profile.mpesa_number || '',
  country: u.profile.country || '', county: u.profile.county || '', ward: u.profile.ward || '',
  location: u.profile.location || '', birthday: u.profile.birthday ? u.profile.birthday.slice(0, 10) : '',
  gender: u.profile.gender || '',
})

function ProfilePage() {
  const { user, ready, setUser } = useAuth()

  if (!ready) return <PageLoading />
  if (!user) {
    return (
      <div className="container-x flex flex-col items-center gap-4 py-16 text-center md:py-24">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-050 text-primary"><UserRound size={28} /></span>
        <h1 className="text-2xl">Your profile</h1>
        <p className="m-0 max-w-sm text-sm text-ink-2">Sign in to edit your details, your extra e-mail addresses and the M-PESA number your orders are paid from.</p>
        <div className="flex w-full max-w-xs flex-col gap-2.5 pt-2">
          <LinkButton to={'/signin' as any} search={{ next: '/profile' }} full>Sign in</LinkButton>
          <LinkButton to={'/register' as any} variant="outline" full>Create account</LinkButton>
        </div>
      </div>
    )
  }
  return <ProfileForm user={user} setUser={setUser} />
}

function ProfileForm({ user, setUser }: { user: User; setUser: (u: User) => void }) {
  const toast = useToast()
  const wardListId = useId()
  const [f, setF] = useState<Form>(() => formOf(user))
  const [emails, setEmails] = useState<ExtraEmail[]>(() => user.profile.extra_emails || [])
  const [places, setPlaces] = useState<Locations>(NO_PLACES)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Locations>('/locations').then(setPlaces).catch(() => {})
  }, [])

  // Any edit clears the failure from the last attempt — it was about the values that have just changed.
  const set = (k: keyof Form) => (v: string) => { setError(''); setF((s) => ({ ...s, [k]: v })) }
  const setEmailList = (next: ExtraEmail[]) => { setError(''); setEmails(next) }
  const counties = places.counties[f.country] || []
  const wardHints = places.wards[f.county] || []
  const saved = useMemo(() => formOf(user), [user])
  const savedEmails = user.profile.extra_emails || []
  const dirty = (Object.keys(saved) as (keyof Form)[]).some((k) => f[k].trim() !== saved[k].trim())
    || JSON.stringify(emails) !== JSON.stringify(savedEmails)

  const problem = (): string => {
    if (!f.first_name.trim() && !f.last_name.trim()) return 'Enter at least your first or last name'
    if (f.telephone.trim() && msisdn(f.telephone).length < 9) return 'That phone number is too short'
    if (f.mpesa_number.trim() && !isMpesaNumber(f.mpesa_number)) return 'Enter a valid M-PESA number, e.g. 0712 345 678'
    for (const e of emails) {
      if (!EMAIL_RE.test(e.email.trim())) return `"${e.email.trim() || 'Empty address'}" is not a valid e-mail address`
      if (e.email.trim().toLowerCase() === user.email.toLowerCase()) return 'That is already your contact e-mail — add a different one'
    }
    const seen = new Set<string>()
    for (const e of emails) {
      const key = e.email.trim().toLowerCase()
      if (seen.has(key)) return `${key} is in the list twice`
      seen.add(key)
    }
    return ''
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const bad = problem()
    if (bad) {
      setError(bad)
      toast.alert(bad)
      return
    }
    setBusy(true)
    try {
      const u = await api.put<User>('/auth/profile', {
        ...f,
        name: `${f.first_name} ${f.last_name}`.trim() || user.name,
        birthday: f.birthday || null,
        extra_emails: emails.map((x) => ({ label: x.label.trim(), email: x.email.trim().toLowerCase() })),
      })
      setUser(u)
      setF(formOf(u))
      setEmails(u.profile.extra_emails || [])
      toast.success('Profile saved')
    } catch (err: any) {
      setError(err.message)
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container-x flex flex-col gap-5 pb-24 pt-5 md:max-w-3xl md:pb-10 md:pt-8">
      <SectionHead title="Your profile" sub="Your details, how sellers and riders reach you, and the number your orders are paid from." />

      <AvatarCard user={user} onSaved={setUser} />

      <form className="flex flex-col gap-5" onSubmit={save}>
        {/* ---------------------------------------------------------------- who you are */}
        <Card className="flex flex-col gap-3.5">
          <FieldsetHead title="Your name" sub="Shown on your orders, your messages and the reviews you leave." />
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Input label="First name" autoComplete="given-name" value={f.first_name} onChange={(e) => set('first_name')(e.target.value)} />
            <Input label="Last name" autoComplete="family-name" value={f.last_name} onChange={(e) => set('last_name')(e.target.value)} />
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Input label="Birthday" type="date" value={f.birthday} onChange={(e) => set('birthday')(e.target.value)} />
            {/* Male or female only. An older account saved as anything else reads back as unset until it is answered. */}
            <Select label="Gender" placeholder="Select" value={f.gender} onChange={(e) => set('gender')(e.target.value)}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </Select>
          </div>
          <Input label="Store name" placeholder="Shown on your ads in place of your name" hint="Sellers only — leave it empty and your ads carry your name." value={f.store_name} onChange={(e) => set('store_name')(e.target.value)} />
        </Card>

        {/* ---------------------------------------------------------------- contacts */}
        <Card className="flex flex-col gap-3.5">
          <FieldsetHead title="How we reach you" sub="Order updates, claim codes and delivery calls go to these." />

          {/* The one field on this page that is not editable — it is the sign-in address. */}
          <Input
            label="Contact e-mail"
            value={user.email}
            readOnly
            disabled
            className="cursor-not-allowed"
            leading={<Mail size={15} />}
            trailing={<Lock size={14} className="text-muted" />}
            hint="Your sign-in address — it can only be changed with a verification code, from the seller dashboard."
          />

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Input label="Phone number" type="tel" autoComplete="tel" placeholder="0712 345 678" value={f.telephone}
              onChange={(e) => set('telephone')(e.target.value)} hint="Riders and shelf owners call this number about your orders." />
            <Input label="M-PESA number" type="tel" placeholder="0712 345 678" value={f.mpesa_number}
              onChange={(e) => set('mpesa_number')(e.target.value)}
              leading={<Smartphone size={15} />}
              error={f.mpesa_number.trim() && !isMpesaNumber(f.mpesa_number) ? 'Not a valid M-PESA number' : undefined}
              hint="The line the payment prompt is sent to at checkout." />
          </div>
          {f.telephone.trim() && !f.mpesa_number.trim() && (
            <button type="button" onClick={() => set('mpesa_number')(f.telephone)} className="self-start text-[11px] font-semibold text-primary hover:underline">
              Use my phone number for M-PESA
            </button>
          )}
          <Notice tone="info" icon={<Smartphone size={15} />}>
            Checkout sends the M-PESA prompt to <strong className="font-head">{prettyPhone(f.mpesa_number || f.telephone) || 'no number yet'}</strong>
            {f.mpesa_number.trim() ? '' : f.telephone.trim() ? ' — your phone number, because no M-PESA number is saved.' : ' — save one so you are not typing it at every checkout.'}
          </Notice>
        </Card>

        {/* ---------------------------------------------------------------- extra emails */}
        <ExtraEmails emails={emails} onChange={setEmailList} primary={user.email} />

        {/* ---------------------------------------------------------------- where you are */}
        <Card className="flex flex-col gap-3.5">
          <FieldsetHead title="Where you are" sub="Your ward decides the shelves you see first and which boosted ads reach you." />
          <div className="grid gap-3.5 sm:grid-cols-3">
            <Select label="Country" placeholder="Select country" value={f.country}
              onChange={(e) => { setError(''); setF((s) => ({ ...s, country: e.target.value, county: '', ward: '' })) }}>
              {places.countries.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            {counties.length ? (
              <Select label="County" placeholder="Select county" value={f.county} onChange={(e) => { setError(''); setF((s) => ({ ...s, county: e.target.value, ward: '' })) }}>
                {counties.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            ) : (
              <Input label="County" placeholder="County / province" value={f.county} onChange={(e) => { setError(''); setF((s) => ({ ...s, county: e.target.value, ward: '' })) }} />
            )}
            <Input label="Ward" list={wardListId} placeholder={wardHints[0] ? `e.g. ${wardHints[0]}` : 'Your ward'} value={f.ward}
              onChange={(e) => set('ward')(e.target.value)} hint={wardHints.length ? 'Pick one or type yours' : undefined} />
            <datalist id={wardListId}>{wardHints.map((w) => <option key={w} value={w} />)}</datalist>
          </div>
          <Input label="Estate / area" placeholder="e.g. Kilimani, Nairobi" value={f.location} onChange={(e) => set('location')(e.target.value)} />
        </Card>

        {error && <Notice tone="danger">{error}</Notice>}

        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center">
          <Button type="submit" size="lg" loading={busy} disabled={!dirty} className="sm:min-w-[200px]">Save profile</Button>
          {dirty && (
            <Button type="button" variant="outline" size="lg" disabled={busy}
              onClick={() => { setF(formOf(user)); setEmailList(user.profile.extra_emails || []) }}>
              Discard changes
            </Button>
          )}
          <span className="flex-1 text-[11px] text-muted sm:pr-3">
            Marketing choices live on your <Link to={'/account' as any} className="font-semibold text-primary hover:underline">account page</Link>.
          </span>
        </div>
      </form>
    </div>
  )
}

function FieldsetHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-[15px]">{title}</h2>
      <span className="text-[11px] text-ink-2">{sub}</span>
    </div>
  )
}

/** Avatar — the picture on your account, and the store image buyers see next to your ads (PUT /auth/profile { avatar }). */
function AvatarCard({ user, onSaved }: { user: User; onSaved: (u: User) => void }) {
  const toast = useToast()
  const inputId = useId()
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null)
  const avatar = user.profile.avatar

  const put = async (next: string) => onSaved(await api.put<User>('/auth/profile', { avatar: next }))
  const pick = async (files: FileList | null, reset: () => void) => {
    const file = files?.[0]
    reset()
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Choose an image file')
    if (file.size > 25 * 1024 * 1024) return toast.error('That image is larger than 25 MB')
    setBusy('upload')
    try {
      const r = await api.upload(file, 'user')
      await put(r.url)
      toast.success('Photo updated')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }
  const remove = async () => {
    setBusy('remove')
    try {
      await put('')
      toast.success('Photo removed')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="flex flex-col items-start gap-3.5 sm:flex-row sm:items-center">
      <Avatar name={user.profile.store_name || user.name} src={avatar || undefined} size={72} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-base font-bold text-ink">{user.profile.store_name || user.name}</span>
        <span className="truncate text-xs text-ink-2">{user.email}</span>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {user.roles.seller && <Chip size="sm" tone="primary">Seller</Chip>}
          {user.roles.shelve_owner && <Chip size="sm" tone="success">Shelf host</Chip>}
          {user.roles.rider && <Chip size="sm" tone="secondary">Rider</Chip>}
          {user.roles.courier && <Chip size="sm" tone="secondary">Courier</Chip>}
          <Chip size="sm">Since {user.profile.joined_year}</Chip>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <label htmlFor={inputId} className={cx('inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border-strong px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-surface', busy && 'pointer-events-none opacity-60')}>
          <ImagePlus size={14} /> {busy === 'upload' ? 'Uploading…' : avatar ? 'Change photo' : 'Add photo'}
        </label>
        <input id={inputId} type="file" accept="image/*" className="hidden"
          onChange={(e) => pick(e.target.files, () => { e.target.value = '' })} />
        {avatar && <Button type="button" size="sm" variant="ghost" loading={busy === 'remove'} disabled={busy === 'upload'} onClick={remove}>Remove</Button>}
      </div>
    </Card>
  )
}

/** The extra addresses. Saved with the rest of the form — the whole list is sent on every save, so a removed row is gone. */
function ExtraEmails({ emails, onChange, primary }: { emails: ExtraEmail[]; onChange: (next: ExtraEmail[]) => void; primary: string }) {
  const full = emails.length >= MAX_EXTRA_EMAILS
  const edit = (i: number, patch: Partial<ExtraEmail>) => onChange(emails.map((e, n) => (n === i ? { ...e, ...patch } : e)))

  return (
    <Card className="flex flex-col gap-3.5">
      <FieldsetHead title="More e-mail addresses" sub={`Copies of receipts and order mail go to these too. Up to ${MAX_EXTRA_EMAILS}, and none of them can sign in.`} />
      {emails.length === 0 && (
        <span className="rounded-md bg-surface px-3.5 py-3 text-xs text-ink-2">
          Only <strong className="font-head text-ink">{primary}</strong> so far. Add a work or a shared address if someone else should get your order mail.
        </span>
      )}
      {/* One row per address. Side by side once there is room; stacked on a phone, where a label squeezed
          next to an e-mail address leaves neither of them readable. */}
      {emails.map((e, i) => (
        <div key={i} className="flex flex-col gap-2.5 rounded-md bg-surface p-3 sm:flex-row sm:items-end sm:bg-transparent sm:p-0">
          <Input label="Label" placeholder="Work" className="sm:w-36 sm:shrink-0" value={e.label} onChange={(ev) => edit(i, { label: ev.target.value })} />
          <div className="flex items-end gap-2 sm:min-w-0 sm:flex-1">
            <Input label="E-mail address" type="email" placeholder="you@example.com" className="min-w-0 flex-1" value={e.email}
              onChange={(ev) => edit(i, { email: ev.target.value })}
              error={e.email.trim() && !EMAIL_RE.test(e.email.trim()) ? 'Not a valid address' : undefined} />
            <button type="button" aria-label={`Remove ${e.email || 'this address'}`} onClick={() => onChange(emails.filter((_, n) => n !== i))}
              className="mb-px flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-md border border-border text-muted hover:border-danger hover:text-danger">
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" icon={<Plus size={14} />} disabled={full} className="self-start"
        onClick={() => onChange([...emails, { label: '', email: '' }])}>
        Add an e-mail address
      </Button>
      {full && <span className="text-[11px] text-muted">That is all {MAX_EXTRA_EMAILS} — remove one to add another.</span>}
    </Card>
  )
}
