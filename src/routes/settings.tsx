/** Settings — /settings — the buyer's notification and marketing switches (terms s. 12, 13 and 13A). */
import { useEffect, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Bell, BellOff, BellRing, Bike, Lock, Mail, Megaphone, MessageSquare, MessagesSquare, ShieldCheck, Smartphone, Store, Tag, Truck, type LucideIcon } from 'lucide-react'
import { api, type MarketingChannel, type NotifyChannel, type NotifySource, type User } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { disablePush, enablePush, pushState, type PushState } from '#/lib/push'
import { useToast } from '#/lib/toast'
import { Button, Card, Notice, PageLoading, PageTitle, Tabs, Toggle, cx } from '#/components/ui'

type Tab = 'notifications' | 'marketing'

export const Route = createFileRoute('/settings')({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => ({ tab: s.tab === 'marketing' ? 'marketing' : undefined }),
  component: SettingsPage,
})

function SettingsPage() {
  const navigate = useNavigate()
  const { user, ready } = useAuth()
  const { tab = 'notifications' } = Route.useSearch()

  useEffect(() => {
    if (ready && !user) navigate({ to: '/signin', search: { next: '/settings' } })
  }, [ready, user, navigate])

  if (!ready || !user) return <PageLoading />

  return (
    <div className="container-x flex flex-col gap-5 pb-8 pt-5 md:max-w-2xl md:pt-8">
      <PageTitle title="Settings" sub="Choose how UKOshop, sellers and delivery partners reach you." />
      <Tabs<Tab>
        tabs={[{ key: 'notifications', label: 'Notifications' }, { key: 'marketing', label: 'Marketing' }]}
        value={tab}
        onChange={(t) => navigate({ to: '/settings', search: t === 'notifications' ? {} : { tab: t }, replace: true })}
      />
      {tab === 'notifications' ? <NotificationSettings /> : <MarketingSettings />}
    </div>
  )
}

/** One save at a time; `key` names what is being changed so only that switch shows as busy. */
function useProfileSave() {
  const { setUser } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState('')
  const save = async (key: string, body: Record<string, unknown>, done: string) => {
    setBusy(key)
    try {
      setUser(await api.put<User>('/auth/profile', body))
      toast.success(done)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy('')
    }
  }
  return { busy, save }
}

// ------------------------------------------------------------------ service notifications (terms s. 13A)
const CHANNELS: { channel: NotifyChannel; label: string; Icon: LucideIcon }[] = [
  { channel: 'push', label: 'Push', Icon: Smartphone },
  { channel: 'sms', label: 'SMS', Icon: MessageSquare },
  { channel: 'email', label: 'E-mail', Icon: Mail },
]
const SOURCES: { source: Exclude<NotifySource, 'admin'>; label: string; sub: string; Icon: LucideIcon }[] = [
  { source: 'seller', label: 'Sellers', sub: 'Order accepted, shipped, bids and replies', Icon: Tag },
  { source: 'shelve', label: 'Shelves', sub: 'Item received, ready to collect, inspections', Icon: Store },
  { source: 'delivery', label: 'Delivery riders', sub: 'Rider assigned, on the way, delivered', Icon: Bike },
  { source: 'courier', label: 'Couriers', sub: 'Items moving between towns', Icon: Truck },
]

function NotificationSettings() {
  const { user } = useAuth()
  const { busy, save } = useProfileSave()
  const prefs = user?.profile?.notifications
  const on = (source: NotifySource, channel: NotifyChannel) => prefs?.[source]?.[channel] !== false
  const channelAllOn = (channel: NotifyChannel) => SOURCES.every(({ source }) => on(source, channel))

  // The channel switch sets that contact for every source at once; the grid below fine-tunes it per source.
  const setChannel = (channel: NotifyChannel, label: string, next: boolean) =>
    save(`channel:${channel}`, { notify_prefs: Object.fromEntries(SOURCES.map(({ source }) => [source, { [channel]: next }])) },
      next ? `${label} notifications are on` : `${label} notifications are off for sellers, shelves, riders and couriers`)
  const setOne = (source: NotifySource, sourceLabel: string, channel: NotifyChannel, label: string, next: boolean) =>
    save(`${source}:${channel}`, { notify_prefs: { [source]: { [channel]: next } } },
      `${label} from ${sourceLabel.toLowerCase()} ${next ? 'on' : 'off'}`)

  return (
    <div className="flex flex-col gap-5">
      <ThisDevice />
      <section className="flex flex-col gap-2">
        <span className="px-1 text-xs font-bold uppercase tracking-wide text-muted">Contacts</span>
        <Card padded={false} className="divide-y divide-border">
          {CHANNELS.map(({ channel, label, Icon }) => (
            <div key={channel} className="flex items-center gap-3.5 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-050 text-primary"><Icon size={16} /></span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold text-ink">{label} notifications</span>
                <span className="text-xs text-ink-2">{channelAllOn(channel) ? 'On for everyone below' : 'Off for some senders'}</span>
              </span>
              <Toggle
                checked={channelAllOn(channel)}
                disabled={busy !== ''}
                label={<span className="sr-only">{label} notifications</span>}
                onChange={(next) => setChannel(channel, label, next)}
              />
            </div>
          ))}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <span className="px-1 text-xs font-bold uppercase tracking-wide text-muted">By sender</span>
        <Card padded={false} className="divide-y divide-border">
          <div className="grid grid-cols-[1fr_repeat(3,3.25rem)] items-center gap-x-1 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <span>From</span>
            {CHANNELS.map(({ channel, label }) => <span key={channel} className="text-center">{label}</span>)}
          </div>
          {SOURCES.map(({ source, label, sub, Icon }) => (
            <div key={source} className="grid grid-cols-[1fr_repeat(3,3.25rem)] items-center gap-x-1 px-4 py-3">
              <span className="flex min-w-0 items-center gap-3">
                <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface text-ink-2 sm:flex"><Icon size={16} /></span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold text-ink">{label}</span>
                  <span className="text-xs text-ink-2">{sub}</span>
                </span>
              </span>
              {CHANNELS.map(({ channel, label: chLabel }) => (
                <span key={channel} className="flex justify-center">
                  <Toggle
                    checked={on(source, channel)}
                    disabled={busy !== ''}
                    label={<span className="sr-only">{chLabel} from {label.toLowerCase()}</span>}
                    onChange={(next) => setOne(source, label, channel, chLabel, next)}
                  />
                </span>
              ))}
            </div>
          ))}
          {/* UKO admin: shown so the buyer sees it exists, but locked on (terms s. 13A). */}
          <div className="grid grid-cols-[1fr_repeat(3,3.25rem)] items-center gap-x-1 bg-surface/60 px-4 py-3">
            <span className="flex min-w-0 items-center gap-3">
              <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md bg-success-050 text-success sm:flex"><ShieldCheck size={16} /></span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">UKO admin <Lock size={12} className="text-muted" aria-hidden /></span>
                <span className="text-xs text-ink-2">Codes, payments, refunds, security and terms. Always on</span>
              </span>
            </span>
            {CHANNELS.map(({ channel, label: chLabel }) => (
              <span key={channel} className="flex justify-center" title="Notifications from UKO admin can't be switched off">
                <Toggle checked disabled label={<span className="sr-only">{chLabel} from UKO admin, always on</span>} onChange={() => {}} />
              </span>
            ))}
          </div>
        </Card>
        <span className="px-1 text-[11px] leading-relaxed text-muted">
          Everything still appears on your <Link to="/notifications" className="font-semibold text-primary hover:underline">Notifications</Link> page.
          Switching a contact off can mean missing a rider at the door or a shelf pick-up deadline
          (terms <Link to={'/terms' as any} hash="notifications" className="font-semibold text-primary hover:underline">section 13A</Link>).
        </span>
      </section>
    </div>
  )
}

/** Web push is per browser: the switches below say who may push, this card says whether this device receives it. */
const DEVICE_TEXT: Record<PushState, string> = {
  unsupported: "This browser can't receive push notifications. On iPhone, add UKOshop to your Home Screen first.",
  unconfigured: 'Push notifications are not available yet.',
  denied: 'Notifications are blocked for UKOshop in this browser. Allow them in the site settings, then come back here.',
  off: 'Turn on push to get alerts on this device, even when UKOshop is closed.',
  on: 'This device gets push notifications from the senders you allow below.',
}

function ThisDevice() {
  const toast = useToast()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    pushState().then(setState).catch(() => setState('unconfigured'))
  }, [])

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key)
    try {
      await fn()
      toast.success(done)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setState(await pushState().catch(() => 'unconfigured' as const))
      setBusy('')
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <span className="px-1 text-xs font-bold uppercase tracking-wide text-muted">This device</span>
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="flex min-w-0 flex-1 items-center gap-3.5">
          <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', state === 'on' ? 'bg-success-050 text-success' : 'bg-surface text-ink-2')}>
            {state === 'on' ? <BellRing size={18} /> : <BellOff size={18} />}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-semibold text-ink">Push on this device {state === 'on' ? 'is on' : 'is off'}</span>
            <span className="text-xs text-ink-2">{state ? DEVICE_TEXT[state] : 'Checking this browser…'}</span>
          </span>
        </span>
        {state === 'off' && (
          <Button size="sm" loading={busy === 'on'} disabled={busy !== ''} onClick={() => run('on', enablePush, 'Push notifications are on for this device')}>Turn on</Button>
        )}
        {state === 'on' && (
          <span className="flex gap-2">
            <Button size="sm" variant="outline" loading={busy === 'test'} disabled={busy !== ''} onClick={() => run('test', () => api.post('/push/test'), 'Test sent. It should appear in a few seconds')}>Send a test</Button>
            <Button size="sm" variant="outline" loading={busy === 'off'} disabled={busy !== ''} onClick={() => run('off', disablePush, 'Push is off for this device')}>Turn off</Button>
          </span>
        )}
      </Card>
    </section>
  )
}

// ------------------------------------------------------------------ marketing (terms s. 12–13)
/** Two layers, the way the terms put it: the master switch turns every channel off at once, and under it one switch
 *  per contact. A contact switched off drops this account out of any seller's reach on that channel while the others
 *  carry on. Sellers only reach accounts that have paid for an order (app/audience.py). */
const MARKETING_ROWS: { channel: MarketingChannel; label: string; sub: string; Icon: LucideIcon }[] = [
  { channel: 'email', label: 'E-mail', sub: 'Offers sent to your account e-mail address', Icon: Mail },
  { channel: 'sms', label: 'SMS', sub: 'Text messages to your mobile number', Icon: MessageSquare },
  { channel: 'whatsapp', label: 'WhatsApp', sub: 'WhatsApp messages to your mobile number', Icon: MessagesSquare },
  { channel: 'inapp', label: 'In-app notifications', sub: 'Offers on your Notifications page', Icon: Bell },
  { channel: 'push', label: 'Push notifications', sub: 'Alerts pushed to this device', Icon: Smartphone },
]

function MarketingSettings() {
  const { user } = useAuth()
  const { busy, save } = useProfileSave()
  const all = user?.profile?.marketing_opt_in !== false
  const channels = user?.profile?.marketing_channels

  return (
    <section className="flex flex-col gap-2">
      {user?.profile?.is_buyer === false && (
        <Notice tone="info" title="No seller marketing yet">
          Sellers can send you offers once you have paid for your first order. Your choices below apply from then on.
        </Notice>
      )}
      <Card className="flex items-center gap-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-050 text-primary"><Megaphone size={18} /></span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold text-ink">Offers from sellers</span>
          <span className="text-xs text-ink-2">Marketing from sellers you have bought from and sellers advertising in your ward.</span>
        </span>
        <Toggle
          checked={all}
          disabled={busy !== ''}
          label={<span className="sr-only">All marketing</span>}
          onChange={(next) => save('marketing_opt_in', { marketing_opt_in: next }, next ? 'Offers from sellers are on' : "Marketing is off on every channel. Sellers can't reach you with it")}
        />
      </Card>

      <Card padded={false} className={cx('divide-y divide-border transition-opacity', !all && 'pointer-events-none opacity-50')}>
        {MARKETING_ROWS.map(({ channel, label, sub, Icon }) => {
          const field = `marketing_${channel}`
          const on = channels?.[channel] !== false
          return (
            <div key={channel} className="flex items-center gap-3.5 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface text-ink-2"><Icon size={16} /></span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold text-ink">{label}</span>
                <span className="truncate text-xs text-ink-2">{sub}</span>
              </span>
              <Toggle
                checked={all && on}
                disabled={!all || busy !== ''}
                label={<span className="sr-only">Marketing by {label}</span>}
                onChange={(next) => save(field, { [field]: next }, next ? `Marketing on ${label.toLowerCase()} is on` : `No more marketing on ${label.toLowerCase()}`)}
              />
            </div>
          )
        })}
      </Card>
      <span className="px-1 text-[11px] leading-relaxed text-muted">
        You choose each contact separately (terms <Link to={'/terms' as any} hash="marketing" className="font-semibold text-primary hover:underline">section 12</Link>).
        Turning one off takes effect at once. Your account stops being counted in any seller's reach on it.
      </span>
    </section>
  )
}
