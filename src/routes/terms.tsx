import { createFileRoute, Link } from '@tanstack/react-router'
import { TERMS, TERMS_EFFECTIVE, TERMS_VERSION } from '#/content/terms'
import { TermsBody } from '#/components/terms-modal'
import { Chip } from '#/components/ui'

export const Route = createFileRoute('/terms')({
  head: () => ({ meta: [{ title: 'Terms and Conditions — UKO shop' }] }),
  component: TermsPage,
})

function TermsPage() {
  return (
    <div className="container-x py-8 md:py-12">
      <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[240px_1fr]">
        <aside className="md:sticky md:top-6 md:self-start">
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            <Chip size="sm" tone="primary">Version {TERMS_VERSION}</Chip>
            <span className="text-[12px] text-ink-2">Effective {TERMS_EFFECTIVE}</span>
            <nav className="flex flex-col gap-1.5">
              {TERMS.map((s) => (
                <a key={s.id} href={`#${s.id}`} className="text-[12px] text-ink-2 hover:text-primary">{s.title}</a>
              ))}
            </nav>
            <Link to={'/register' as any} className="mt-1 text-[12px] font-semibold text-primary hover:underline">Create an account →</Link>
          </div>
        </aside>
        <article className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-[28px] md:text-[32px]">UKOshop Terms and Conditions</h1>
            <p className="m-0 text-sm text-ink-2">Please read these terms carefully. You accept them when you create an account, and the version you accepted is recorded on your profile.</p>
          </div>
          <TermsBody />
        </article>
      </div>
    </div>
  )
}
