import mongoose from 'mongoose'

/**
 * Singleton document `_id: 'default'` — toggles for auth channels and admin MFA policy.
 */
const platformSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'default' },
    /** When false, POST /auth/request-otp with `email` is rejected. */
    login_email_enabled: { type: Boolean, default: true },
    /** When false, POST /auth/request-otp with `phone` is rejected. */
    login_phone_enabled: { type: Boolean, default: true },
    /** When false, admin users with TOTP skip the second factor (email OTP only). */
    admin_totp_required: { type: Boolean, default: true },
    /** Shown in admin UI; optional branding label. */
    site_display_name: { type: String, default: 'i8now', maxlength: 80 },
    /** Admin panel UI customization settings. */
    ui_settings: {
      type: {
        site_name: { type: String, default: 'i8now Admin', maxlength: 80 },
        site_subtitle: { type: String, default: 'Operations', maxlength: 80 },
        logo_data_url: { type: String, default: null },
        login_left_image_url: { type: String, default: null },
        login_left_heading: { type: String, default: 'Operations command centre', maxlength: 120 },
        login_left_caption: {
          type: String,
          default: 'Manage workers, employers, timesheets, and platform settings from one place.',
          maxlength: 300,
        },
        theme: { type: String, enum: ['light', 'dark', 'system'], default: 'light' },
        accent: {
          type: String,
          enum: ['zinc', 'blue', 'violet', 'green', 'rose', 'amber', 'orange', 'cyan'],
          default: 'zinc',
        },
        radius: { type: String, enum: ['none', 'sm', 'md', 'lg', 'xl'], default: 'lg' },
        font_family: {
          type: String,
          enum: ['geist', 'inter', 'dm-sans', 'system', 'mono'],
          default: 'geist',
        },
        font_size: { type: String, enum: ['sm', 'md', 'lg'], default: 'md' },
        letter_spacing: { type: String, enum: ['tight', 'normal', 'wide'], default: 'normal' },
        nav_items: {
          type: [
            {
              id: {
                type: String,
                enum: ['overview', 'users', 'workers', 'employers', 'shifts', 'timesheets', 'applications'],
                required: true,
              },
              visible: { type: Boolean, required: true, default: true },
            },
          ],
          default: [
            { id: 'overview', visible: true },
            { id: 'users', visible: true },
            { id: 'workers', visible: true },
            { id: 'employers', visible: true },
            { id: 'shifts', visible: true },
            { id: 'timesheets', visible: true },
            { id: 'applications', visible: true },
          ],
        },
      },
      default: {},
    },
    updated_at: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
)

export type PlatformSettingsDoc = mongoose.InferSchemaType<typeof platformSettingsSchema> & { _id: string }

export const PlatformSettingsModel = mongoose.model('PlatformSettings', platformSettingsSchema)
