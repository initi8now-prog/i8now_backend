import { PlatformSettingsModel, type PlatformSettingsDoc } from './platformSettings.model.js'

export async function getOrCreatePlatformSettings(): Promise<PlatformSettingsDoc> {
  let doc = await PlatformSettingsModel.findById('default').exec()
  if (!doc) {
    doc = await PlatformSettingsModel.create({
      _id: 'default',
      login_email_enabled: true,
      login_phone_enabled: true,
      admin_totp_required: true,
      site_display_name: 'i8now',
      ui_settings: {
        site_name: 'i8now Admin',
        site_subtitle: 'Operations',
        logo_data_url: null,
        login_left_image_url: null,
        login_left_heading: 'Operations command centre',
        login_left_caption: 'Manage workers, employers, timesheets, and platform settings from one place.',
        theme: 'light',
        accent: 'zinc',
        radius: 'lg',
        font_family: 'geist',
        font_size: 'md',
        letter_spacing: 'normal',
        nav_items: [
          { id: 'overview', visible: true },
          { id: 'users', visible: true },
          { id: 'workers', visible: true },
          { id: 'employers', visible: true },
          { id: 'shifts', visible: true },
          { id: 'timesheets', visible: true },
          { id: 'applications', visible: true },
        ],
      },
      updated_at: new Date(),
    })
  }
  return doc
}

export async function updatePlatformSettings(
  patch: Partial<{
    login_email_enabled: boolean
    login_phone_enabled: boolean
    admin_totp_required: boolean
    site_display_name: string
    ui_settings: {
      site_name: string
      site_subtitle: string
      logo_data_url: string | null
      login_left_image_url: string | null
      login_left_heading: string
      login_left_caption: string
      theme: 'light' | 'dark' | 'system'
      accent: 'zinc' | 'blue' | 'violet' | 'green' | 'rose' | 'amber' | 'orange' | 'cyan'
      radius: 'none' | 'sm' | 'md' | 'lg' | 'xl'
      font_family: 'geist' | 'inter' | 'dm-sans' | 'system' | 'mono'
      font_size: 'sm' | 'md' | 'lg'
      letter_spacing: 'tight' | 'normal' | 'wide'
      nav_items: Array<{
        id: 'overview' | 'users' | 'workers' | 'employers' | 'shifts' | 'timesheets' | 'applications'
        visible: boolean
      }>
    }
  }>,
): Promise<PlatformSettingsDoc | null> {
  return PlatformSettingsModel.findByIdAndUpdate(
    'default',
    { $set: { ...patch, updated_at: new Date() } },
    { new: true },
  ).exec()
}
