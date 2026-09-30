/**
 * Boost pricing shared by the Post ad form and the Seller dashboard's boost dialog.
 *
 * The two shop channels — top of search (`shop`) and the home carousel (`carousel`) — are bought by COUNTY and
 * billed per county per day at one flat rate countrywide: KSh 300 a day for search, KSh 1,000 for the carousel.
 * An ad aimed at three counties runs in all three, so it pays three times the daily rate and takes a slot in
 * each. Each county shows only so many boosts a day (3 carousel slots in Nairobi), which is what makes a slot
 * worth buying — the API refuses one in a county that is full (GET /boost/availability says which are).
 *
 * The two channels also run for different lengths: a search boost is a short push (2 days), a carousel slot is
 * booked for longer (5 days). Those are the defaults the form starts at; the seller may set any number of days.
 *
 * The maths here mirrors app/config.py and app/services.py boost_quote(); the server is the authority and
 * GET /boost/quote is asked for the real figure, these run it locally so the total moves the instant a county,
 * a day or a channel changes.
 */
export type Rates = { shop: number; carousel: number }

/** Video ads on the UKOapp ad site must play to their end before the viewer can go on, so they may run 45 s. A
 *  longer one is fined KSh 500 for every started 30 s over, on each ad-site boost (app/services.py video_fine). */
export const VIDEO_AD = { max_seconds: 45, fine_ksh: 500, block_seconds: 30 }
/** The over-length fine for a video of `seconds` — 0 when it fits, or its length is not known yet. */
export const videoFine = (seconds?: number | null): number => {
  const over = Math.round(((seconds || 0) - VIDEO_AD.max_seconds) * 100)
  return over > 0 ? Math.ceil(over / (VIDEO_AD.block_seconds * 100)) * VIDEO_AD.fine_ksh : 0
}
/** 75 → "1:15" */
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
export type DayChannel = keyof Rates
/** GET /boost/availability · slots left in a county today. `left[channel] === 0` means it cannot be bought. */
export type Availability = { county: string; slots: Rates; taken: Rates; left: Rates; rates: Rates }
/** One line per shop channel: its rate, the counties it runs in, and its own run length. */
export type QuoteLine = { channel: DayChannel; label: string; per_day: number; counties: number; days: number; per_day_total: number; total: number }

export const BASE_RATES: Rates = { shop: 300, carousel: 1000 }
export const BASE_DAYS: Rates = { shop: 2, carousel: 5 }
export const BASE_SLOTS: Rates = { shop: 4, carousel: 1 }
export const DAY_CHANNELS: DayChannel[] = ['shop', 'carousel']
export const isDayChannel = (c: string): c is DayChannel => c === 'shop' || c === 'carousel'

/** Boosts that may run in `county` on one day. Once they are taken nobody else can buy that channel there today. */
export const slotsIn = (county: string, channel: DayChannel, slots: Record<string, Partial<Rates>>, defaults: Rates = BASE_SLOTS): number =>
  slots[county]?.[channel] ?? defaults[channel]

/** Where a boost runs: the counties the seller picked, else the county the ad itself is in. */
export const countiesOf = (picked: string[], adCounty: string): string[] => {
  const out = [...new Set(picked.map((c) => c.trim()).filter(Boolean))]
  return out.length ? out : adCounty ? [adCounty] : []
}

/** Run length per channel — what the seller set, else that channel's default. */
export const daysIn = (channel: DayChannel, days: Partial<Rates>, defaults: Rates = BASE_DAYS): number =>
  Math.max(1, Math.round(days[channel] || 0) || defaults[channel])

export const channelLines = (
  channels: string[], counties: string[], days: Partial<Rates>, rates: Rates = BASE_RATES, defaults: Rates = BASE_DAYS,
  labels: Record<string, string> = {},
): QuoteLine[] =>
  channels.filter(isDayChannel).map((channel) => {
    const n = counties.length || 1
    const d = daysIn(channel, days, defaults)
    return { channel, label: labels[channel] || channel, per_day: rates[channel], counties: n, days: d,
             per_day_total: rates[channel] * n, total: rates[channel] * n * d }
  })

/** Counties where a channel the seller switched on has no place left today. */
export const fullIn = (availability: Availability[], channels: string[]): { county: string; channel: DayChannel }[] =>
  availability.flatMap((a) => channels.filter(isDayChannel).filter((c) => a.left[c] <= 0).map((c) => ({ county: a.county, channel: c })))
