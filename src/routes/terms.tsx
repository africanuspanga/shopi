import { Link, createFileRoute } from '@tanstack/react-router'
import { LegalPage, Section } from '#/components/legal'
import { useT } from '#/lib/i18n'
import { FREE_PRODUCTS, TEMBO_PRICE } from '#/lib/plans'
import { canonical } from '#/lib/seo'

export const Route = createFileRoute('/terms')({
  head: () => ({ meta: [{ title: 'Terms · Shopi' }, { name: 'description', content: 'The rules for selling and buying on Shopi.' }], links: [canonical('/terms')] }),
  component: Terms,
})

function Terms() {
  const t = useT()
  return (
    <LegalPage
      title={t('Terms')}
      lead={t(
        'These terms are the agreement between you and Driftmark Technologies Limited, which runs Shopi. By opening a shop, or by ordering from a shop on shopi.tz, you agree to them. Please read them; they are short.',
      )}
    >
      <Section title={t('What Shopi is')}>
        <p>
          {t(
            'Shopi gives sellers an online shop in one link, with orders, stock, analytics and tools to sell. Each shop is run by its seller, not by Shopi. When you buy, you buy from the seller: the sale, the product, the delivery and any refund are between you and the seller.',
          )}
        </p>
        <p>
          {t(
            'Shopi never holds buyers’ money. Buyers pay the seller directly, by the seller’s Lipa Namba or in cash on delivery, or through a licensed payment partner when that is offered. Delivery fees are agreed between buyer and seller on WhatsApp.',
          )}
        </p>
      </Section>

      <Section title={t('Your account')}>
        <ul>
          <li>{t('You must be 18 or older and give your real name and a phone number you use.')}</li>
          <li>{t('Keep your password to yourself. You are responsible for what happens in your account.')}</li>
          <li>{t('Your shop link is yours while your account is open. We may take back a link that copies another brand or misleads buyers.')}</li>
        </ul>
      </Section>

      <Section title={t('Selling on Shopi')}>
        <ul>
          <li>{t('Describe products honestly, with real photos, prices and stock. Deliver what you sell, as described.')}</li>
          <li>{t('Confirm a payment only after the money is in your account. Shopi checks payment SMS for obvious problems, but you make the final check.')}</li>
          <li>{t('Follow Tanzanian law, including tax (TRA) and consumer rules. Receipts from Shopi are not TRA fiscal receipts.')}</li>
          <li>{t('Use buyers’ details only to handle their order and to reply to them, and keep them safe.')}</li>
        </ul>
      </Section>

      <Section title={t('What you can’t sell or do')}>
        <ul>
          <li>{t('Illegal goods or services, weapons, drugs, counterfeit or stolen goods, or anything that needs a licence you don’t have.')}</li>
          <li>{t('Adult content, or anything that harms children.')}</li>
          <li>{t('Fraud: fake shops, fake payment messages, or taking payment without delivering.')}</li>
          <li>{t('Using other people’s photos, brands or content without their permission.')}</li>
          <li>{t('Trying to break, overload or copy Shopi, or to reach other sellers’ data.')}</li>
        </ul>
        <p>{t('We may hide a product, pause a shop or close an account that breaks these rules, and report fraud to the authorities.')}</p>
      </Section>

      <Section title={t('Plans and payment')}>
        <ul>
          <li>{t('A shop on Free costs nothing and has no time limit. It holds up to {n} products.', { n: FREE_PRODUCTS })}</li>
          <li>
            {t('Tembo costs {price} a year and adds the features listed on the plan page. Prices may change; a change applies from your next year, and we tell you first.', {
              price: `TSh ${TEMBO_PRICE.toLocaleString('en-US')}`,
            })}
          </li>
          <li>{t('Shopi takes no commission on your sales.')}</li>
          <li>{t('Tembo is paid in advance and is not refunded for the part of the year not used, unless the law requires it or we close your shop without a reason under these terms.')}</li>
          <li>{t('If Tembo ends unpaid, your shop goes back to Free: it keeps selling, Tembo’s features switch off, and nothing is deleted.')}</li>
        </ul>
      </Section>

      <Section title={t('Your content')}>
        <p>
          {t(
            'Your photos, texts and shop details stay yours. You allow Shopi to store and show them to run your shop and to show your shop and products inside Shopi, for example in search or on a list of shops. You can delete them at any time.',
          )}
        </p>
      </Section>

      <Section title={t('Our responsibility')}>
        <p>
          {t(
            'We work to keep Shopi running and your data safe, but we can’t promise it will never be down or free of errors. Shopi is not responsible for products, deliveries, payments between buyers and sellers, or disputes between them. As far as the law allows, our total responsibility to a seller is limited to what that seller paid Shopi in the last 12 months.',
          )}
        </p>
      </Section>

      <Section title={t('Closing your account')}>
        <p>
          {t('You can close your account at any time; see')}{' '}
          <Link to="/data-deletion" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
            {t('Delete your data')}
          </Link>
          . {t('We may close an account that breaks these terms, after telling you why, unless the law or fraud stops us.')}
        </p>
      </Section>

      <Section title={t('Law and changes')}>
        <p>
          {t(
            'These terms follow the laws of Tanzania, and disputes go to the courts of Tanzania. If we change them in a way that matters, we tell sellers before the change applies. How we handle personal data is explained in',
          )}{' '}
          <Link to="/privacy" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
            {t('Privacy')}
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  )
}
