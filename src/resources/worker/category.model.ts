import mongoose from 'mongoose'

/* ═══════════════════════════════════════════════════════════════════════════
 *  Category — global job categories workers can pick (catalog table)
 *
 *  Seeded at startup with stable ids (cat_01 …) so Postman and apps can rely
 *  on PUT /workers/categories with those ids. Not tied to a single user.
 * ═══════════════════════════════════════════════════════════════════════════ */

const categorySchema = new mongoose.Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  icon_url: { type: String, required: true },
})

export type CategoryDoc = mongoose.InferSchemaType<typeof categorySchema> & { _id: string }

export const CategoryModel = mongoose.model('Category', categorySchema)
