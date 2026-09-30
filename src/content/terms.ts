/**
 * UKOshop Terms and Conditions. Rendered on /terms and inside the create-account modal.
 * Bump TERMS_VERSION whenever the text changes — the version a user accepted is stored on the account.
 */
export const TERMS_VERSION = '2026-09-22.5'
export const TERMS_EFFECTIVE = '22 September 2026'

export type TermsSection = { id: string; title: string; paragraphs: string[]; bullets?: string[] }

export const TERMS: TermsSection[] = [
  {
    id: 'about',
    title: '1. About UKOshop and these terms',
    paragraphs: [
      'UKOshop ("UKO", "we", "us") is the shopping module of the UKO platform (ad site · eden · shop), operated from Nairobi, Kenya. It lets users buy and sell items, host and use ward-level shelves, trade items by barter, and have purchases delivered.',
      'By creating an account you agree to these Terms and Conditions, our Privacy terms (section 14) and the policies referenced here. If you do not agree, do not create an account or use the service.',
      'Words such as "buyer", "seller", "shelve host", "rider" and "item" refer to the roles and listings described on the platform. A "shelve" is a small hosted space in a ward where sellers place items for verification, storage, collection and delivery.',
    ],
  },
  {
    id: 'accounts',
    title: '2. Accounts and eligibility',
    paragraphs: [
      'You must be at least 18 years old to create an account. You must give your real name, a working e-mail address (verified by the code we send you) and, where asked, a phone number and accurate location details.',
      'You are responsible for everything done with your account and for keeping your password private. Tell us at once if you believe your account has been used without your permission.',
      'One person may hold one buyer/seller account. Shelve hosts, delivery riders and courier drivers do not need a UKOshop account: they apply in the UKO shelves, delivery or courier app and, once approved, sign in there with the company e-mail UKO assigns them. UKO staff use their own staff accounts.',
    ],
  },
  {
    id: 'buying',
    title: '3. Buying, payment and escrow',
    paragraphs: [
      'Items marked "Verified" have been checked at a shelve. When you pay for a verified item (M-PESA), UKO holds the money in escrow. It is released to the seller, the shelve and the rider only after you claim the item at the shelve with your national ID and shelf code, or confirm delivery with your rider code.',
      'Prices, delivery fees and taxes are shown before you place an order. Storing an item at a shelve is free — no storage fee is charged to the buyer or the seller. Items in your cart are held for 24 hours after payment for pickup at the shelve; unpaid orders may be cancelled after that period.',
      'Every order carries two unique codes known only to you: a shelf code for collection and a rider code for delivery. Do not share them until you have checked the item.',
    ],
  },
  {
    id: 'selling',
    title: '4. Selling, shelves and commission',
    paragraphs: [
      'Sellers do not need their own shop: you may post an ad and place the item on the shelve in your ward. The item stays "Pending verification" and cannot be bought until the shelve host has physically checked it against your ad and entered the matching hand-off code.',
      'You may bring the item to the shelve yourself, free of charge, or ask for a UKO rider to collect it from you. A rider trip is priced by distance and vehicle, quoted before you post, and paid with the ad. When the rider comes, you give them your rider code, shown on the ad in your seller console: it proves the rider has collected the item. The hand-off code is separate and is for the shelve. The rider is paid when the shelve host checks the item in. If you bring the item to the shelve yourself before any rider has collected it, the trip is withdrawn and its fee is refunded to your seller wallet.',
      'UKOshop earns a commission of 20% of the item price on every item sold through a shelve. The remaining 80% is credited to your seller wallet when escrow is released. Storing your item at a shelve costs you nothing: the shelve host is funded out of that same 20%, taking 15 points of the item price while UKO keeps 5.',
      'For distant orders, items may be moved shelve-to-shelve so the buyer collects, or is delivered from, the shelve nearest to them. Transfers are recorded on the order timeline.',
      'Storage on a shelve is free but it does not last for ever: a shelve keeps your item free for 60 days from the day it is sent, and the date it runs out is shown on the ad and in your seller console. We remind you 7 days before that date. When it runs out the item comes off the shelve and loses its verified status: the ad stays up, but the item is no longer held, checked or covered by escrow, and buyers order it from you directly (section 7) until you send it to a shelve again. The item is yours to collect from the shelve; send it to a shelve again at any time to have it verified afresh, which starts a new 60 days.',
      'You may also take your item back off the shelve yourself at any time before that. The item then becomes unverified and off-shelf in the same way and sells directly from you. You cannot take an item off the shelve while the shelve still has a paid order for it waiting to be collected or picked up by a rider: those orders are handed over first.',
      'You must have the right to sell every item you list, describe it truthfully (condition, defects, what is included) and keep stock numbers accurate. Counterfeit, stolen, prohibited or unsafe goods are not allowed and will be removed.',
    ],
  },
  {
    id: 'images',
    title: '5. Photos, videos and AI-generated images',
    paragraphs: [
      'You may upload your own photos and videos, or generate product images from a text prompt using the paid AI image add-on (KSh 500 for 5 prompts). AI-assisted images are labelled as such on the ad.',
      'Any image, generated or not, must show the actual item you are selling. When the item is dropped at a shelve, the host compares it with the ad images; an item that does not match its pictures is rejected and the ad may be suspended. Verified status is only granted after this physical check.',
      'You keep the rights to your content but grant UKO a licence to display it on the platform, in search results, on the UKOapp ad site and eden, and on UKO’s social media ad channels for as long as the ad is live.',
    ],
  },
  {
    id: 'barter',
    title: '6. Barter trades',
    paragraphs: [
      'Where a seller allows it, a buyer may bid for an item with another item, a service, cash, or a combination (item + cash, item + service, cash + service). The cash amount is zero unless a cash option is chosen.',
      'Barter trades arranged through a shelve are inspected by the shelve host before the items change hands. If either item is not usable or does not match its description the trade is denied. The shelve’s inspection fee is paid in KSh and shown before the bid is placed.',
      'Barter trades done directly between buyer and seller are not inspected, not covered by escrow and are at the parties’ own risk.',
    ],
  },
  {
    id: 'direct',
    title: '7. Direct orders (at your own risk)',
    paragraphs: [
      'Buyers and sellers may choose to deal directly outside the shelve system ("Order from the seller directly"). Such orders are not verified, not held in escrow and not delivered by UKO riders.',
      'UKOshop provides the contact between the parties only. UKO accepts no liability for direct orders: no refunds, disputes, guarantees or delivery cover apply, and the parties vindicate UKO from any loss arising from them.',
    ],
  },
  {
    id: 'delivery',
    title: '8. Delivery, riders and taxi option',
    paragraphs: [
      'Delivery from a shelve is carried out by approved delivery partners (riders) or courier partners for upcountry parcels. Each delivery carries a shelf code (shelve to rider), a seller code (agent pickup from a seller) and the buyer’s rider code (hand-over to the buyer).',
      'At checkout you may also choose a taxi delivery for your whole cart. The taxi fee is quoted before you place the order and is paid with the order.',
      'Delivery windows are estimates. Report a damaged, incomplete or missing parcel within 24 hours; escrow stays on hold until the dispute is resolved.',
      'Every shelf order carries a UKO Protect fee: 1% of each item’s price, at most KSh 500 for any one unit and at least KSh 20 an order, shown before you pay. If an item is lost, stolen or damaged while a UKO shelve, rider or courier holds it, and you report it within 24 hours, UKO refunds the item price to your UKO wallet. UKO Protect is UKO’s own buyer guarantee, not an insurance policy sold to you, and it does not cover direct orders. It is refunded with the delivery fee if the whole order is cancelled before anything has moved, and is otherwise non-refundable.',
      'While nothing has moved, a buyer who cancels a paid order gets the whole payment back to their UKO wallet, delivery fee included. Once a rider has collected the item the order can no longer be cancelled by the buyer, and if it is later cancelled or returned the delivery fee is the rider’s for the trip and is not refunded (section 17).',
    ],
  },
  {
    id: 'hosts',
    title: '9. Shelve host applications',
    paragraphs: [
      'Shelve hosting is by application and approval. UKO keeps three shelves per ward. Applicants must be between 25 and 30 years of age, hold a valid county business permit and national ID, provide a lockable premises, be present during opening hours and pass a site visit.',
      'Hosts store items with reasonable care, release items only against a valid shelf code and national ID, inspect barter trades honestly, and give at least 14 days notice before relocating. A contract can only be terminated once every item on the shelve has been claimed or returned to its seller.',
      'Hosts charge no storage fee. They earn 15% of the price of every item sold off their shelve, plus the barter inspection fee, paid to their shelve wallet. Withdrawals from the shelve wallet go to M-PESA and carry a 10% withdrawal fee (section 15).',
    ],
  },
  {
    id: 'riders',
    title: '10. Delivery partners',
    paragraphs: [
      'Riders and drivers apply with their ID, licence, vehicle documents and insurance. Approved riders accept jobs offered by shelves, collect only with a valid shelf or seller code, deliver within the agreed window and capture proof of delivery (buyer code, signature or photo).',
      'UKO keeps a commission of 10% of every rider trip, both deliveries to buyers and pick-ups taking a seller’s item to a shelve. It comes out of the rider’s fee: the prices buyers and sellers pay do not change. The trip fee less that 10% is credited to the rider wallet when the trip is completed — a delivery on a confirmed hand-over to the buyer, a pick-up when the shelve host checks the item in — and can be withdrawn to M-PESA. Every rider withdrawal still carries a 10% withdrawal fee (section 15).',
      'UKO courier drivers, who carry parcels between counties, pay the same 10% commission on every courier leg. It comes out of the leg fee, so the courier fee the buyer pays does not change. The leg fee less that 10% is credited to the courier wallet when the load is handed over at the destination shelve, and courier withdrawals carry the 10% withdrawal fee too.',
    ],
  },
  {
    id: 'packages',
    title: '11. Seller packages, boosting and advertising',
    paragraphs: [
      'Sellers may buy pay-per-use messaging packages: units for e-mail, SMS and WhatsApp messages to their buyers and contacts, units for in-app and push notifications where UKO offers them, and units for posts about their ads, which are published on UKOshop’s X (Twitter), Facebook and Instagram accounts. A message is delivered only to a buyer who has that contact switched on (section 12), and a unit spent on a buyer who has switched it off is not charged. These posts must be respectful and related to buying and selling, and UKO may withdraw any post that is flagged. Units are used only for messages and posts that actually go out, and they do not expire. Package prices are shown before payment.',
      'Sellers may boost items for a fee paid in KSh. On the UKOapp ad site the fee is charged per view — KSh 500 for every 1,000 views, bought in blocks of 1,000 and paid up front — and the ad is served with a link back to the ad until those views are delivered. The two shop channels are bought by county and charged per county per day, at the same rate in every county: KSh 300 a day at the top of shop search and category results, and KSh 1,000 a day in the homepage carousel. A boost aimed at more than one county runs in each of them and is charged for each of them. The two channels run for different lengths — 2 days on search and 5 in the carousel unless the seller sets otherwise, minimum 1 day — and each expires on its own day. Each county shows a limited number of boosted ads per day, for example 3 homepage carousel slots in Nairobi, and a boost cannot be bought in a county whose slots for that day are already taken. Boost fees are paid by M-PESA when the ad is posted, and boosted items are prioritised for the paid duration. Views on the UKOapp ad site are counted and reported back to the seller, and an ad site ad is retired once its paid views are used up.',
      'A homepage carousel slot is bought for a county and is shown to shoppers in that county. Where no carousel boost is running in a shopper’s county, UKOshop may show the carousel boosts bought for another county instead, or show none at all.',
      'A seller may also post an ad to the UKOapp ad site only. Such an ad is not listed anywhere in UKOshop — not in search, category pages, the home page or shelf pages — and requires the UKOapp ad site fee of KSh 500 per 1,000 views. Its ad page remains reachable through the link served on the ad site so that viewers can reach the seller.',
      'Messages and posts sent through packages must be truthful, lawful and about your own items. Abuse leads to loss of the package without refund.',
    ],
  },
  {
    id: 'marketing',
    title: '12. Marketing messages and your choices',
    paragraphs: [
      'By creating an account you authorise UKO, and the sellers on UKOshop through UKO, to send you marketing about items, offers, boosts and shop news on any of the contacts you have given us.',
      'You become a buyer on UKOshop once you have paid for your first order. From then on, sellers may send you marketing by e-mail and SMS (and on the other contacts below) through UKO. An account that has never paid for an order is not included in any seller’s marketing audience. Those contacts are:',
    ],
    bullets: [
      'e-mail, to the address on your account;',
      'SMS, to your mobile number;',
      'WhatsApp, to your mobile number;',
      'in-app notifications, shown on your Notifications page when you are signed in;',
      'push notifications, sent to the device or browser you use UKOshop on.',
    ],
  },
  {
    id: 'marketing-consent',
    title: '13. Withdrawing marketing consent',
    paragraphs: [
      'This consent covers marketing from sellers you have bought from or contacted, and from sellers advertising to the ward or county your account is registered in. It does not let a seller take your e-mail address or phone number: sellers buy message units, target wards, and UKO delivers the message — a ward-targeted seller never sees your contact details.',
      'You may allow or refuse each contact separately at any time under Account → Settings → Marketing messages: one switch turns all marketing off, and below it one switch each for e-mail, SMS, WhatsApp, in-app notifications and push notifications. Turning a contact off takes effect at once — your account stops being counted in any seller’s reach on that channel and no further marketing is sent to it. Every marketing e-mail also carries a note telling you where the switch is.',
      'Withdrawing marketing consent does not stop service messages, which are not marketing: order, payment, escrow, claim-code, delivery and wallet updates, replies from a seller you are chatting with, and notices about your account or these terms. Section 13A explains which of those you can switch off.',
      'Standard network charges from your mobile operator or internet provider may apply to messages you receive. We process this consent under the Kenya Data Protection Act, 2019 (section 37).',
    ],
  },
  {
    id: 'notifications',
    title: '13A. Service notifications and your settings',
    paragraphs: [
      'Service notifications tell you about your orders, deliveries and account. They come from five sources: the sellers you buy from, the shelve hosts holding or releasing your items, the delivery riders bringing them to you, the couriers moving them between towns, and UKO admin. By default every source can reach you by push notification, SMS and e-mail.',
      'Under Account → Settings → Notifications you can switch push, SMS or e-mail off for each of the seller, shelve, delivery and courier sources separately. The change takes effect at once. Every service notification is still recorded on your Notifications page, so switching a contact off never hides information about your order. It only stops that contact from being used.',
      'Notifications from UKO admin cannot be switched off. They are always sent on every contact, because they carry sign-in and verification codes, payment, escrow, refund and wallet confirmations, security alerts, dispute decisions and changes to these terms.',
      'If you switch off a contact that a seller, shelve host, rider or courier uses to reach you, you may miss time-sensitive updates such as a rider arriving or an item being ready for collection. UKO is not responsible for a missed collection, delivery or deadline caused by notifications you chose to switch off (section 18).',
    ],
  },
  {
    id: 'privacy',
    title: '14. Your data and privacy',
    paragraphs: [
      'To run the service we collect the data you give us (name, e-mail, phone, national ID at claims, payout numbers) and data about how you use UKOshop, including your location and contact details, orders, bids, searches and views.',
      'We use this data to verify accounts, process payments and escrow, trace every order from the seller to the claim of the item, prevent fraud, and to recommend items and show personalised ads on UKOshop, the UKOapp ad site, eden and UKO’s social media channels. Your e-mail address, phone number and device are also used to send you the marketing you have agreed to on each of them (sections 12 and 13).',
      'Data is shared only with the parties needed to complete a transaction (the shelve host, the rider, the seller or buyer), payment providers and messaging providers, and where the law requires. We do not sell your personal data. You may ask to see, correct or delete your data by writing to support@uko-app.co.ke, subject to records we must keep for tax and fraud prevention.',
      'We process personal data under the Kenya Data Protection Act, 2019.',
    ],
  },
  {
    id: 'wallets',
    title: '15. Wallets, withdrawals and fees',
    paragraphs: [
      'Seller, shelve, rider and courier earnings are credited to in-app wallets when escrow is released or the trip is completed. A shelve, rider or courier wallet belongs to that shelve, rider or courier, whether or not it is linked to a UKOshop account, and is withdrawn in the partner’s own app. All withdrawals are paid to M-PESA and are subject to a minimum withdrawal of KSh 100.',
      'A wallet can be spent inside UKO only on UKO’s own services: boosts, ad posting charges, messaging packages and AI prompts. A wallet cannot pay a seller for an order, and money cannot be moved from one wallet to another. A shelve, rider or courier linked to a UKOshop account by UKO may spend its wallet on those services from that account.',
      'Sellers, shelve hosts, delivery riders and couriers pay a withdrawal fee of 10% of every amount withdrawn from an earnings wallet. The fee is deducted from the amount withdrawn and kept by UKO: for example, a KSh 1,000 withdrawal debits KSh 1,000 from the wallet and sends KSh 900 to M-PESA. The fee and the amount you will receive are shown before you confirm. Withdrawing a refund from your UKO wallet carries no fee.',
      'Withdrawal fees are non-refundable once the withdrawal has been sent. If a withdrawal fails or is cancelled, the full amount, including the fee, is returned to your wallet.',
      'Package fees, boost fees, AI prompt packs, inspection fees and delivery fees are non-refundable once used or delivered. Refunds for cancelled paid orders are paid into your UKO wallet, where you can spend them on UKO services or withdraw them to M-PESA free of charge (section 17).',
    ],
  },
  {
    id: 'conduct',
    title: '16. Prohibited items and conduct',
    paragraphs: ['You must not use UKOshop to:'],
    bullets: [
      'list counterfeit, stolen, illegal, hazardous or recalled goods, weapons, drugs, or items you have no right to sell;',
      'mislead buyers with false descriptions, prices, stock or images (including AI images that do not match the real item);',
      'pay or ask for payment outside the platform for a verified item to avoid commission;',
      'harass other users, hosts, riders or staff, or send spam through package messaging;',
      'interfere with the platform, scrape data, or use another person’s account.',
    ],
  },
  {
    id: 'disputes',
    title: '17. Returns, cancellations and disputes',
    paragraphs: [
      'A buyer may cancel an unpaid or processing order, that is, while nothing has moved. A paid order cancelled at that point is refunded in full to the buyer’s UKO wallet, delivery fee and shelve inspection fee included. Once a rider has collected the item the buyer can no longer cancel the order. If it is later cancelled or returned, the delivery fee is the rider’s for the trip and is not refunded. Likewise, the barter inspection fee is not refunded once the trade has reached the shelve.',
      'As a seller you may cancel an order only while the item is still at your own shop. You cannot cancel it once the item is on a shelve — the shelve is holding it and hands it to the buyer — and you cannot cancel it while it is with a rider or after it has been delivered. Once the item has moved, the only decision left to you is to mark it returned, which refunds the buyer in the same way.',
      'Cancelling and returning are decided item by item: where a cart holds several items, or items from several sellers, pulling one item leaves the rest of the order standing. Each cancelled or returned item is refunded to the buyer’s UKO wallet on its own, and a refund cannot be undone — the buyer orders the item again if they still want it.',
      'A buyer returns a received item by bringing it to any UKO shelve with the order number and the shelve code on the order. The item must not be damaged: the shelve inspects and photographs it, and a damaged item is refused — the buyer takes it back and the sale stands, with payment released to the seller and the shelve. An accepted item is refunded to the buyer’s UKO wallet at once, for the item price only: delivery fees and shelve inspection fees are not refundable. The shelve that accepts the return holds the item from then on and puts it back on sale; its free storage period carries on from when it was first shelved.',
      'Returned items go back to the seller unless a shelve accepted them as above. An item taken back off a shelve by its seller, or one whose free shelve storage has run out, becomes unverified and off-shelf and is then bought directly from the seller (sections 4 and 7).',
      'Disputes on verified orders are handled by UKO support using the order timeline, shelve verification records and proof of delivery. UKO’s decision on escrow release is final between the parties.',
    ],
  },
  {
    id: 'liability',
    title: '18. Liability',
    paragraphs: [
      'UKOshop is a marketplace and logistics facilitator. Except for escrow-protected verified orders, UKO is not a party to the sale and does not guarantee the quality, safety or legality of items or the ability of users to complete a transaction.',
      'To the extent permitted by law, UKO’s liability to you for any claim related to the service is limited to the amount you paid UKO for the transaction concerned. UKO is not liable for indirect or consequential loss, and not liable at all for direct orders (section 7) or direct barter trades (section 6).',
      'Items on a shelve are insured up to KSh 100,000 per shelve as described in the shelve host agreement.',
    ],
  },
  {
    id: 'termination',
    title: '19. Suspension and termination',
    paragraphs: [
      'We may suspend or close accounts, ads, shelves or delivery partners that break these terms, the law, or put other users at risk, and may withhold escrow while a dispute or investigation is open. You may close your account at any time once your open orders, trades and wallet balances are settled.',
    ],
  },
  {
    id: 'changes',
    title: '20. Changes, law and contact',
    paragraphs: [
      'We may update these terms; the version you accepted is recorded on your account and you will be asked to accept material changes when you next sign in. These terms are governed by the laws of Kenya and the courts of Kenya have jurisdiction.',
      'Questions or complaints: support@uko-app.co.ke · 0717 323 852 · Nairobi, Kenya. Report a complaint from the footer of any page.',
    ],
  },
]
