/** Rich text (CKEditor 5), media uploader, placeholder map panel, simple bar chart. */
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { ImageIcon, MapPin, Play, Upload, X } from 'lucide-react'
import { api, type UploadRole } from '#/lib/api'
import { VIDEO_AD, clock, videoFine } from '#/lib/boost'
import { Chip, Skeleton, cx } from './ui'

const CKEditorImpl = lazy(() => import('./ckeditor'))

export function RichEditor({ label, value, onChange, hint, max = 4000, placeholder, variant = 'full', rows = 'h-48' }: { label: string; value: string; onChange: (html: string) => void; hint?: string; max?: number; placeholder?: string; variant?: 'full' | 'message'; rows?: string }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const count = value.replace(/<[^>]+>/g, '').length
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-ink-2">{label}</span>
        <span className="text-[11px] text-muted">CKEditor</span>
      </div>
      <div className="overflow-hidden rounded-md border border-border">
        {mounted ? (
          <Suspense fallback={<Skeleton className={cx(rows, 'rounded-none')} />}>
            <CKEditorImpl value={value} onChange={onChange} placeholder={placeholder} variant={variant} />
          </Suspense>
        ) : (
          <Skeleton className={cx(rows, 'rounded-none')} />
        )}
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>{hint || "Buyers read this first — be specific about condition and what's included."}</span>
        <span className={count > max ? 'text-danger' : ''}>{count} / {max}</span>
      </div>
    </div>
  )
}

/** How long a video file runs, read by the browser before it is uploaded (undefined when it cannot tell). */
const fileSeconds = (f: File) => new Promise<number | undefined>((resolve) => {
  const url = URL.createObjectURL(f)
  const v = document.createElement('video')
  const done = (s?: number) => { URL.revokeObjectURL(url); resolve(s && Number.isFinite(s) ? s : undefined) }
  v.preload = 'metadata'
  v.onloadedmetadata = () => done(v.duration)
  v.onerror = () => done()
  setTimeout(() => done(), 8000)
  v.src = url
})

/** `videoAd`: the ad can be boosted onto the UKOapp ad site, so each video shows its length against the 45 s limit
 *  and the fine a longer one carries. `onVideoSeconds` hears each video's length as it becomes known. */
export function MediaUploader({ images, videos, onChange, max = 8, role = 'user', videoAd = false, onVideoSeconds }: { images: string[]; videos: string[]; onChange: (images: string[], videos: string[]) => void; max?: number; role?: UploadRole; videoAd?: boolean; onVideoSeconds?: (src: string, seconds: number) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(0)
  const [err, setErr] = useState('')
  const [lengths, setLengths] = useState<Record<string, number>>({})
  const heard = (src: string, seconds?: number | null) => {
    if (!seconds || !Number.isFinite(seconds)) return
    setLengths((l) => (l[src] === seconds ? l : { ...l, [src]: seconds }))
    onVideoSeconds?.(src, seconds)
  }
  const handle = async (files: FileList | null) => {
    if (!files) return
    setErr('')
    const imgs = [...images]
    const vids = [...videos]
    for (const f of Array.from(files)) {
      if (imgs.length >= max && f.type.startsWith('image/')) continue
      if (f.size > 25 * 1024 * 1024) { setErr(`${f.name} is larger than 25 MB`); continue }
      setBusy((b) => b + 1)
      try {
        const isVideo = f.type.startsWith('video/')
        const r = await api.upload(f, role, isVideo ? await fileSeconds(f) : undefined)
        if (r.kind === 'video') { vids.push(r.url); heard(r.url, r.video?.seconds) }
        else imgs.push(r.url)
        onChange([...imgs], [...vids])
      } catch (e: any) {
        setErr(e.message)
      } finally {
        setBusy((b) => b - 1)
      }
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handle(e.dataTransfer.files) }} className="flex h-[120px] w-[140px] flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-border-strong bg-surface text-center text-ink-2 hover:border-primary-300 hover:text-primary">
          <Upload size={20} />
          <span className="text-xs font-semibold">Drop images or browse</span>
          <span className="text-[10px] text-muted">JPG, PNG or MP4 · max 25 MB · up to {max}</span>
        </button>
        {images.map((src, i) => (
          <div key={src} className="relative h-[120px] w-[140px] overflow-hidden rounded-md border border-border bg-surface-2">
            <img src={src} alt="" className="h-full w-full object-cover" />
            {i === 0 && <Chip size="sm" tone="primary" className="absolute left-1.5 top-1.5">Cover</Chip>}
            <button type="button" onClick={() => onChange(images.filter((x) => x !== src), videos)} className="absolute right-1.5 top-1.5 rounded-full bg-ink/70 p-1 text-white" aria-label="Remove"><X size={12} /></button>
          </div>
        ))}
        {videos.map((src, i) => (
          <div key={src} className="relative flex h-[120px] w-[140px] items-center justify-center overflow-hidden rounded-md border border-border bg-ink text-white">
            <video src={src} className="h-full w-full object-cover opacity-70" muted preload="metadata" onLoadedMetadata={(e) => { if (!lengths[src]) heard(src, e.currentTarget.duration) }} />
            <Play size={24} className="absolute" />
            {lengths[src] ? (
              <Chip size="sm" tone={videoAd && i === 0 && lengths[src] > VIDEO_AD.max_seconds ? 'danger' : 'neutral'} className="absolute bottom-1.5 left-1.5">
                {clock(lengths[src])}{videoAd && i === 0 && lengths[src] > VIDEO_AD.max_seconds ? ` · over ${VIDEO_AD.max_seconds}s` : ''}
              </Chip>
            ) : null}
            <button type="button" onClick={() => onChange(images, videos.filter((x) => x !== src))} className="absolute right-1.5 top-1.5 rounded-full bg-ink/70 p-1 text-white" aria-label="Remove"><X size={12} /></button>
          </div>
        ))}
        {busy > 0 && <div className="flex h-[120px] w-[140px] items-center justify-center rounded-md border border-border bg-surface"><Chip size="sm" tone="primary">Uploading…</Chip></div>}
      </div>
      {err && <span className="text-xs text-danger">{err}</span>}
      {videoAd && (() => {
        const first = videos[0] ? lengths[videos[0]] : undefined
        const fine = videoFine(first)
        return (
          <span className={cx('text-xs', fine ? 'font-semibold text-danger' : 'text-muted')}>
            {fine
              ? `Your video runs ${clock(first!)} — over the ${VIDEO_AD.max_seconds} s limit for UKOapp video ads. Boosting it on the UKOapp ad site adds a KSh ${fine.toLocaleString()} fine (KSh ${VIDEO_AD.fine_ksh} per ${VIDEO_AD.block_seconds} s over). Trim it to ${VIDEO_AD.max_seconds} s to pay nothing extra.`
              : `UKOapp video ads play to the end before viewers can continue, so keep your first video to ${VIDEO_AD.max_seconds} s. Longer videos are fined KSh ${VIDEO_AD.fine_ksh} per ${VIDEO_AD.block_seconds} s over when boosted on the UKOapp ad site.`}
          </span>
        )
      })()}
      <input ref={input} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => handle(e.target.files)} />
    </div>
  )
}

/** Stylised map placeholder with pins + route (no external tiles needed). */
export function MapPanel({ pins, route, className, height = 260 }: { pins: { label: string; x: number; y: number; tone?: 'primary' | 'secondary' | 'success' }[]; route?: boolean; className?: string; height?: number }) {
  const tones = { primary: 'bg-primary text-white', secondary: 'bg-secondary text-white', success: 'bg-success text-white' }
  return (
    <div className={cx('relative w-full overflow-hidden rounded-md border border-border bg-[#eef2f7]', className)} style={{ height }}>
      <svg className="absolute inset-0 h-full w-full text-border-strong" viewBox="0 0 400 260" preserveAspectRatio="none">
        {[40, 90, 140, 190, 240].map((y) => <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="currentColor" strokeWidth="6" opacity="0.5" />)}
        {[60, 140, 220, 300, 360].map((x) => <line key={x} x1={x} y1="0" x2={x} y2="260" stroke="currentColor" strokeWidth="6" opacity="0.5" />)}
        <rect x="150" y="100" width="70" height="60" fill="#dfe8d8" opacity="0.8" />
        <rect x="290" y="30" width="60" height="40" fill="#d8e3ee" opacity="0.8" />
        {route && pins.length >= 2 && (
          <polyline points={pins.map((p) => `${p.x * 4},${p.y * 2.6}`).join(' ')} fill="none" stroke="#2F44A8" strokeWidth="3" strokeDasharray="6 5" strokeLinecap="round" />
        )}
      </svg>
      {pins.map((p) => (
        <div key={p.label} className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
          <span className={cx('whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold shadow', tones[p.tone || 'primary'])}>{p.label}</span>
          <MapPin size={16} className={p.tone === 'secondary' ? 'text-secondary' : p.tone === 'success' ? 'text-success' : 'text-primary'} />
        </div>
      ))}
    </div>
  )
}

export function BarChart({ data, series, height = 180 }: { data: Record<string, any>[]; series: { key: string; label: string; color: string }[]; height?: number }) {
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-end justify-center gap-0.5" style={{ height: height - 20 }}>
              {series.map((s) => (
                <div key={s.key} title={`${s.label}: ${d[s.key]}`} className="w-full max-w-3 rounded-t-sm" style={{ height: `${(Number(d[s.key]) / max) * 100}%`, background: s.color, minHeight: d[s.key] ? 2 : 0 }} />
              ))}
            </div>
            <span className="text-[10px] text-muted">{d.label}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-4 text-[11px] text-ink-2">
        {series.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}</span>)}
      </div>
    </div>
  )
}

export function Thumb({ src, size = 56, video, className, children }: { src?: string; size?: number; video?: boolean; className?: string; children?: ReactNode }) {
  return (
    <div style={{ width: size, height: size }} className={cx('relative flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2', className)}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={size * 0.35} className="text-border-strong" />}
      {video && <Play size={size * 0.35} className="absolute text-white drop-shadow" />}
      {children}
    </div>
  )
}

// ---------------------------------------------------------------- UploadTile
import { FileCheck as FileCheckIcon } from 'lucide-react'

/** Single-purpose upload tile (documents / ID photos) — "Business permit · Upload", shows file state once uploaded. */
export function UploadTile({ label, value, onChange, max = 1, accept = 'image/*,.pdf', capture, className, role = 'user' }: { label: string; value: string[]; onChange: (urls: string[]) => void; max?: number; accept?: string; capture?: boolean; className?: string; role?: UploadRole }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const handle = async (files: FileList | null) => {
    if (!files || !files.length) return
    setErr('')
    setBusy(true)
    const next = [...value]
    try {
      for (const f of Array.from(files)) {
        if (next.length >= max) break
        if (f.size > 25 * 1024 * 1024) { setErr(`${f.name} is larger than 25 MB`); continue }
        const r = await api.upload(f, role)
        next.push(r.url)
      }
      onChange(next)
    } catch (e: any) {
      setErr(e.message || 'Upload failed')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  const has = value.length > 0
  const state = busy ? 'Uploading…' : has ? (value.length === 1 ? value[0].split('/').pop()?.slice(-24) || '1 file' : `${value.length} files`) : max > 1 ? `Upload up to ${max}` : 'Upload'
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handle(e.dataTransfer.files) }}
        className={cx('relative flex min-h-[112px] w-full flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed px-3 py-4 text-center transition-colors', has ? 'border-success/40 bg-success-050 text-success' : 'border-border-strong bg-surface text-ink-2 hover:border-primary-300 hover:text-primary')}
      >
        {has ? <FileCheckIcon size={20} /> : <Upload size={20} />}
        <span className={cx('text-xs font-semibold', has ? 'text-ink' : '')}>{label}</span>
        <span className={cx('max-w-full truncate text-[11px]', has ? 'text-success' : 'text-muted')}>{state}</span>
        {has && !busy && (
          <span role="button" aria-label="Clear" onClick={(e) => { e.stopPropagation(); onChange([]) }} className="absolute right-1.5 top-1.5 rounded-full bg-ink/60 p-1 text-white"><X size={11} /></span>
        )}
      </button>
      {err && <span className="text-[11px] text-danger">{err}</span>}
      <input ref={input} type="file" multiple={max > 1} accept={accept} {...(capture ? { capture: 'environment' as any } : {})} className="hidden" onChange={(e) => handle(e.target.files)} />
    </div>
  )
}
