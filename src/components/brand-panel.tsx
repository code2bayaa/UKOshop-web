/** Brand panel from frame 07 · Sign In & Register — shared by /signin and /register. */
import { Check } from 'lucide-react'

const BENEFITS = ['Track orders from shelf to doorstep', 'Post ads and boost them on the UKOapp ad site', 'Chat with sellers and keep receipts in one place']

export function BrandPanel() {
  return (
    <aside className="grad-hero flex w-full flex-col justify-between gap-8 rounded-[20px] p-6 text-white md:min-h-[560px] md:w-[400px] md:shrink-0 md:p-7">
      <div className="flex flex-col gap-3.5">
        <span className="font-head text-xl font-extrabold">UKO shop</span>
        <h2 className="text-[24px] leading-[1.2] text-white md:text-[28px]">Sell Without a Shop.<br/> Buy Without the Risk.</h2>
      </div>
      <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
        {BENEFITS.map((t) => (
          <li key={t} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-white/80">
            <Check size={16} className="mt-0.5 shrink-0 text-secondary" /> {t}
          </li>
        ))}
      </ul>
    </aside>
  )
}
