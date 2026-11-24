import { createFileRoute } from '@tanstack/react-router'
import { LegalPage, Section } from '#/components/legal'
import { useT } from '#/lib/i18n'
import { canonical } from '#/lib/seo'

export const Route = createFileRoute('/data-deletion')({
  head: () => ({ meta: [{ title: 'Delete your data · Shopi' }, { name: 'description', content: 'How sellers and buyers delete their data from Shopi.' }], links: [canonical('/data-deletion')] }),
  component: DataDeletion,
})

function DataDeletion() {
  const t = useT()
  return (
    <LegalPage title={t('Delete your data')} lead={t('How to remove your data from Shopi, as a seller or as a buyer, and what happens when you do.')}>
      <Section title={t('Sellers')}>
        <ul>
          <li>{t('Products and photos: delete them yourself in Products. Photos leave our storage, except ones a past order still shows.')}</li>
          <li>
            {t(
              'Your whole account and shop: write to hello@shopi.tz, or message us on WhatsApp, from the phone number you log in with, and say “Delete my Shopi account”. We confirm it is you, then delete your account, shop, products and photos within 30 days.',
            )}
          </li>
          <li>{t('Orders are kept only as long as the law requires for business records, then deleted.')}</li>
        </ul>
      </Section>

      <Section title={t('Buyers')}>
        <ul>
          <li>{t('Details remembered on your phone (bag, name, number, area, location): clear your browser’s data for shopi.tz.')}</li>
          <li>
            {t(
              'A back-in-stock request: it is deleted once the seller has messaged you, or after 90 days. To remove it sooner, write to hello@shopi.tz with your number and the shop.',
            )}
          </li>
          <li>
            {t(
              'A chat with a shop’s AI assistant: it is deleted 90 days after your last message. It keeps no name or phone number. To remove it sooner, write to hello@shopi.tz with the shop, the day and what you asked.',
            )}
          </li>
          <li>
            {t(
              'Your orders: write to hello@shopi.tz with your phone number and the order code (it looks like #AB12CD). We remove your name, number and address from those orders within 30 days, and tell the seller.',
            )}
          </li>
        </ul>
      </Section>

      <Section title={t('If you connected Instagram or Facebook')}>
        <p>
          {t(
            'If you used Instagram or Facebook to import your shop, we keep only what you chose to import (such as photos and captions) as part of your shop. To remove the connection, remove Shopi in your Instagram or Facebook settings under Apps and websites, and send us a deletion request as above; we delete what we got from it within 30 days.',
          )}
        </p>
      </Section>
    </LegalPage>
  )
}
