import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { CircleAlert, Eye, EyeOff } from 'lucide-react'
import { ApiError } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useToast } from '#/lib/toast'
import { Button, Checkbox, Input, Notice } from '#/components/ui'
import { BrandPanel } from '#/components/brand-panel'
import { GoogleSignInButton } from '#/components/google-button'

type Search = { next?: string }

export const Route = createFileRoute('/signin')({
  validateSearch: (s: Record<string, unknown>): Search => ({ next: typeof s.next === 'string' && s.next.startsWith('/') ? s.next : undefined }),
  component: SignInPage,
})

function SignInPage() {
  const navigate = useNavigate()
  const { next } = Route.useSearch()
  const { login, loginWithGoogle, user, ready } = useAuth()
  const toast = useToast()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)

  useEffect(() => {
    if (ready && user) navigate({ to: (next || '/') as any })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const u = await login(identifier.trim(), password)
      toast.success(`Welcome back, ${u.name.split(' ')[0]}`)
      navigate({ to: (next || '/') as any })
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }
  const google = async (idToken: string) => {
    setGoogleBusy(true)
    setError('')
    try {
      const { user: u } = await loginWithGoogle(idToken)
      toast.success(`Signed in as ${u.name}`)
      navigate({ to: (next || '/') as any })
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        toast.alert('No UKO account uses this Google e-mail yet — create one first')
        navigate({ to: '/register' as any, search: { next } as any })
      } else {
        setError(err instanceof ApiError ? err.message : 'Google sign-in failed. Try again.')
      }
    } finally {
      setGoogleBusy(false)
    }
  }

  return (
    <div className="container-x py-6 md:py-10">
      <div className="mx-auto flex max-w-[860px] flex-col gap-6 md:flex-row md:items-stretch md:gap-7">
        <div className="hidden md:block"><BrandPanel /></div>
        <form onSubmit={submit} className="flex flex-1 flex-col gap-4 rounded-lg border border-border bg-bg p-5 md:p-[26px]">
          <div className="flex flex-col gap-1">
            <h1 className="text-[22px]">Sign in</h1>
            <p className="m-0 text-xs text-ink-2">Use the email or phone number on your UKO account.</p>
          </div>
          <Input label="Email or phone" required autoComplete="username" placeholder="you@example.com or 07xx xxx xxx" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
          <Input
            label="Password"
            required
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            trailing={<button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="flex text-muted hover:text-ink">{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>}
          />
          <div className="flex items-center justify-between gap-3">
            <Checkbox checked={remember} onChange={setRemember} label={<span className="text-xs">Keep me signed in</span>} />
            <Link to={'/help' as any} className="text-xs font-semibold text-primary-600 hover:underline">Forgot password?</Link>
          </div>
          <Button type="submit" size="lg" full loading={busy}>Sign in</Button>
          <div className="flex items-center gap-3 text-[11px] text-muted"><span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" /></div>
          <GoogleSignInButton text="signin_with" disabled={googleBusy} onCredential={google} />
          {error && <Notice tone="danger" icon={<CircleAlert size={14} />}><span className="text-danger">{error}</span></Notice>}
          <p className="m-0 text-center text-xs text-ink-2">
            New to UKO? <Link to="/register" search={{ next }} className="font-semibold text-primary-600 hover:underline">Create account</Link>
          </p>
        </form>
        <div className="md:hidden"><BrandPanel /></div>
      </div>
    </div>
  )
}

