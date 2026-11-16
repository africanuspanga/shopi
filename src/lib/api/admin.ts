import { createServerFn } from '@tanstack/react-start'
import { asAdminDays, asAdminTab } from '#/lib/admin'
import { growthData, healthData, moneyData, shopData, shopsData, todayData, useData } from '#/server/admin'
import { requireAdmin } from '#/server/auth'

/**
 * The owner dashboard (/admin, users.is_admin): every shop and seller, orders and sales across Shopi, plans and income.
 * Each section reads only its own numbers (`src/server/admin.ts`).
 */
export const getOwnerDashboard = createServerFn({ method: 'GET' })
  .validator((d: { days?: number; tab?: string }) => ({ days: asAdminDays(d?.days), tab: asAdminTab(d?.tab) }))
  .handler(async ({ data }) => {
    await requireAdmin()
    const { days, tab } = data
    if (tab === 'shops') return { tab, days, ...(await shopsData(days)) }
    if (tab === 'money') return { tab, days, ...(await moneyData(days)) }
    if (tab === 'growth') return { tab, days, ...(await growthData(days)) }
    if (tab === 'use') return { tab, days, ...(await useData(days)) }
    if (tab === 'health') return { tab, days, ...(await healthData(days)) }
    return { tab: 'today' as const, days, ...(await todayData(days)) }
  })

export type OwnerDashboard = Awaited<ReturnType<typeof getOwnerDashboard>>
export type OwnerSection<T extends OwnerDashboard['tab']> = Extract<OwnerDashboard, { tab: T }>

export const getAdminShop = createServerFn({ method: 'GET' })
  .validator((d: { id: string; days?: number }) => ({ id: String(d?.id ?? '').slice(0, 40), days: asAdminDays(d?.days) }))
  .handler(async ({ data }) => {
    await requireAdmin()
    return shopData(data.id, data.days)
  })

export type AdminShopPage = NonNullable<Awaited<ReturnType<typeof getAdminShop>>>
