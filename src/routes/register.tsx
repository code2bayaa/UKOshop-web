import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '#/lib/auth'
import { BrandPanel } from '#/components/brand-panel'
import { CreateAccountForm } from '#/components/create-account'

type Search = { next?: string }

export const Route = createFileRoute('/register')({
  validateSearch: (s: Record<string, unknown>): Search => ({ next: typeof s.next === 'string' && s.next.startsWith('/') ? s.next : undefined }),
  component: RegisterPage,
})

function RegisterPage() {
  const navigate = useNavigate()
  const { next } = Route.useSearch()
  const { user, ready } = useAuth()

  useEffect(() => {
    if (ready && user) navigate({ to: (next || '/') as any })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user])

  return (
    <div className="container-x py-6 md:py-10">
      <div className="mx-auto flex max-w-[860px] flex-col gap-6 md:flex-row md:items-stretch md:gap-7">
        <div className="hidden md:block"><BrandPanel /></div>
        <CreateAccountForm next={next} onDone={() => navigate({ to: (next || '/') as any })} />
        <div className="md:hidden"><BrandPanel /></div>
      </div>
    </div>
  )
}
