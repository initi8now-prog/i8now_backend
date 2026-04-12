/* ═══════════════════════════════════════════════════════════════════════════
 *  category.repo — read catalog rows + one-time seed of default categories
 *
 *  DB only. Seed runs once at server startup if the collection is empty.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { CategoryModel, type CategoryDoc } from './category.model.js'

/** Default categories (ids match API doc examples like cat_01). */
const SEED_ROWS: Array<{ _id: string; name: string; slug: string; icon_url: string }> = [
  { _id: 'cat_01', name: 'Hospitality', slug: 'hospitality', icon_url: 'https://cdn.gigwork.in/icons/hospitality.png' },
  { _id: 'cat_02', name: 'Retail', slug: 'retail', icon_url: 'https://cdn.gigwork.in/icons/retail.png' },
  { _id: 'cat_03', name: 'Events', slug: 'events', icon_url: 'https://cdn.gigwork.in/icons/events.png' },
  { _id: 'cat_04', name: 'Warehousing', slug: 'warehousing', icon_url: 'https://cdn.gigwork.in/icons/warehousing.png' },
  { _id: 'cat_05', name: 'Delivery', slug: 'delivery', icon_url: 'https://cdn.gigwork.in/icons/delivery.png' },
  { _id: 'cat_06', name: 'Cleaning', slug: 'cleaning', icon_url: 'https://cdn.gigwork.in/icons/cleaning.png' },
  { _id: 'cat_07', name: 'Security', slug: 'security', icon_url: 'https://cdn.gigwork.in/icons/security.png' },
  { _id: 'cat_08', name: 'Admin & Office', slug: 'admin-office', icon_url: 'https://cdn.gigwork.in/icons/admin.png' },
]

/** Inserts seed categories once when the collection has zero documents. */
export async function ensureDefaultCategories(): Promise<void> {
  const n = await CategoryModel.countDocuments().exec()
  if (n > 0) return
  await CategoryModel.insertMany(SEED_ROWS)
}

export async function findById(id: string): Promise<CategoryDoc | null> {
  return CategoryModel.findById(id).exec()
}

/** Returns every row whose _id is in `ids` (order not guaranteed — caller sorts). */
export async function findByIds(ids: string[]): Promise<CategoryDoc[]> {
  if (ids.length === 0) return []
  return CategoryModel.find({ _id: { $in: ids } }).exec()
}
