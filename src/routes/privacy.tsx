import { Link, createFileRoute } from '@tanstack/react-router'
import { LegalPage, Section } from '#/components/legal'
import { useT } from '#/lib/i18n'
import { canonical } from '#/lib/seo'

export const Route = createFileRoute('/privacy')({
  head: () => ({ meta: [{ title: 'Privacy · Shopi' }, { name: 'description', content: 'What Shopi collects, why, who sees it and how to delete it.' }], links: [canonical('/privacy')] }),
  component: Privacy,
})

function Privacy() {
  const t = useT()
  return (
    <LegalPage
      title={t('Privacy')}
      lead={t(
        'This page explains what personal data Shopi collects, why, who sees it, and how you can see, correct or delete it. It applies to sellers who open a shop and to buyers who visit or order from a shop on shopi.tz. We follow the Personal Data Protection Act, 2022 of Tanzania.',
      )}
    >
      <Section title={t('Who is responsible')}>
        <p>
          {t(
            'Shopi is run by Driftmark Technologies Limited, Dar es Salaam, Tanzania. For the data in your Shopi account and for how the service works, we are responsible. Each seller is responsible for how they use their buyers’ details to fulfil orders. Contact us at hello@shopi.tz.',
          )}
        </p>
      </Section>

      <Section title={t('What we collect from sellers')}>
        <ul>
          <li>{t('Your name, phone number and a password (we store only a scrambled form of it).')}</li>
          <li>{t('Your shop: its name, link, logo, bio, location, Google Maps link, opening hours, social accounts and WhatsApp number.')}</li>
          <li>{t('How you are paid: your Lipa Namba, its name and network. Shopi never holds your money.')}</li>
          <li>{t('Your products, photos, prices and stock, and the orders your shop receives.')}</li>
          <li>{t('Your plan and its payments.')}</li>
        </ul>
      </Section>

      <Section title={t('What we collect from buyers')}>
        <ul>
          <li>{t('When you order: your name, phone number, area, landmark, any note, what you ordered, and how you pay. A payment SMS you paste is kept to check the payment.')}</li>
          <li>
            {t(
              'When you visit a shop: anonymous usage, such as pages viewed, items added to the bag, the app or link you came from, your type of phone and your city (worked out from your connection, not your exact location). It uses a random ID kept on your phone, not your name or number.',
            )}
          </li>
          <li>
            {t(
              'If you ask to hear when a sold-out product is back: your WhatsApp number and what you asked for. It goes to that seller only, so they can message you.',
            )}
          </li>
          <li>{t('On your phone only: your bag, and your name, number and landmark so the next checkout is quicker. They stay in your browser.')}</li>
        </ul>
      </Section>

      <Section title={t('Why we use it')}>
        <ul>
          <li>{t('To run your shop and deliver orders: a buyer’s details go to the seller they ordered from, so the seller can confirm, deliver and contact them.')}</li>
          <li>{t('To show sellers how their shop is doing (visits, sources, sales), in numbers that do not name buyers who did not order.')}</li>
          <li>{t('To keep Shopi safe: to stop fraud, such as a payment SMS used twice, and to keep bots out.')}</li>
          <li>{t('To bill sellers for their plan and to tell them about their account.')}</li>
        </ul>
        <p>{t('We do not sell personal data, and we do not use it for advertising by others.')}</p>
      </Section>

      <Section title={t('Who sees it')}>
        <ul>
          <li>{t('The seller you order from sees your order details. Other sellers do not.')}</li>
          <li>
            {t(
              'Companies that run parts of Shopi for us, only for that purpose: Cloudflare (hosting, database and photo storage), and, when you use them, our payment partner Settlo Pay, Google (maps) and Meta (WhatsApp and Instagram).',
            )}
          </li>
          <li>{t('Authorities, when Tanzanian law requires it.')}</li>
        </ul>
      </Section>

      <Section title={t('Where it is stored')}>
        <p>
          {t(
            'Shopi runs on Cloudflare, whose servers are outside Tanzania. Data sent to them is protected in transit and at rest, and is handled under the safeguards the Personal Data Protection Act requires for transfers outside the country.',
          )}
        </p>
      </Section>

      <Section title={t('Cookies and storage on your phone')}>
        <p>
          {t(
            'Sellers who log in get one cookie that keeps them logged in, and one that remembers their language. Buyers get no login cookie. The bag, the remembered checkout details and the random visitor ID are kept in your browser’s storage, and you can clear them at any time in your browser settings.',
          )}
        </p>
      </Section>

      <Section title={t('How long we keep it')}>
        <ul>
          <li>{t('Seller accounts and shops: while the account is open. A shop on a break is kept so it can open again.')}</li>
          <li>{t('Orders: as long as the seller’s account is open, so sellers keep their records, and as long as the law requires for business records.')}</li>
          <li>{t('Visit data: up to 13 months, then it is deleted or kept only as totals.')}</li>
          <li>{t('Back-in-stock requests: deleted once the seller has messaged you, and after 90 days at most.')}</li>
          <li>{t('Backup copies of the database: up to 5 weeks, then they are deleted.')}</li>
        </ul>
      </Section>

      <Section title={t('Your rights')}>
        <p>
          {t(
            'You can ask to see the personal data we hold about you, to correct it, to delete it, or to object to how we use it. Sellers can change most of it themselves in Shop settings. For anything else, write to hello@shopi.tz from the phone number or email linked to your data; we answer within 30 days.',
          )}
        </p>
        <p>
          {t('To delete your data, see')}{' '}
          <Link to="/data-deletion" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
            {t('Delete your data')}
          </Link>
          .{' '}
          {t('If you are not satisfied with our answer, you can complain to the Personal Data Protection Commission of Tanzania.')}
        </p>
      </Section>

      <Section title={t('Children')}>
        <p>{t('Shopi is not meant for children under 18. Sellers must be 18 or older.')}</p>
      </Section>

      <Section title={t('Changes')}>
        <p>{t('If we change this page in a way that matters, we will tell sellers in the app or on WhatsApp before it applies. The date at the top shows the latest version.')}</p>
      </Section>
    </LegalPage>
  )
}
