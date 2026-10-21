import { nativeLocaleSchema, type NativeLocale } from '@persistent/shared'
/** Machine settings and freedesktop autostart. Credentials remain exclusively in the Chromium profile. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { serverOrigin } from './security.js'

export const WINDOW_SIZES = [
  { id: 'compact', label: 'Compact', width: 380, height: 560 },
  { id: 'standard', label: 'Standard', width: 420, height: 680 },
  { id: 'tall', label: 'Tall', width: 420, height: 960 }
]
export interface LinuxSettings {
  locale?: NativeLocale
  server: string
  notifications: boolean
  pinFlyout: boolean
  width: number
  height: number
  placement: 'tray' | 'last' | 'center'
  appTheme: 'system' | 'light' | 'dark'
  checkUpdatesAutomatically: boolean
  settingsWidth?: number
  settingsHeight?: number
  settingsX?: number
  settingsY?: number
  x?: number
  y?: number
}
export const DEFAULT_SERVER = 'https://persistent.dynamic-solutions.ca'
const DEFAULTS: LinuxSettings = { server: DEFAULT_SERVER, notifications: false, pinFlyout: false, width: 420, height: 960, placement: 'tray', appTheme: 'system', checkUpdatesAutomatically: true }

/** Accept only bounded, known values from both disk and web content. */
export function validatedSettings(value: unknown, previous: LinuxSettings = DEFAULTS): LinuxSettings {
  const settings = { ...previous }
  if (typeof value !== 'object' || value === null) return settings
  const raw = value as Record<string, unknown>
  const locale = nativeLocaleSchema.safeParse(raw.locale)
  if (locale.success) settings.locale = locale.data
  if (typeof raw.server === 'string') {
    try { settings.server = serverOrigin(raw.server) } catch { /* Invalid saved origins use the previous safe origin. */ }
  }
  for (const key of ['notifications', 'pinFlyout', 'checkUpdatesAutomatically'] as const) {
    if (typeof raw[key] === 'boolean') settings[key] = raw[key]
  }
  if (Number.isInteger(raw.width) && (raw.width as number) >= 320 && (raw.width as number) <= 1200) settings.width = raw.width as number
  if (Number.isInteger(raw.height) && (raw.height as number) >= 400 && (raw.height as number) <= 1600) settings.height = raw.height as number
  if (['tray', 'last', 'center'].includes(raw.placement as string)) settings.placement = raw.placement as LinuxSettings['placement']
  if (['system', 'light', 'dark'].includes(raw.appTheme as string)) settings.appTheme = raw.appTheme as LinuxSettings['appTheme']
  for (const key of ['settingsWidth', 'settingsHeight'] as const) {
    if (Number.isInteger(raw[key]) && (raw[key] as number) >= 400 && (raw[key] as number) <= 3000) settings[key] = raw[key] as number
  }
  for (const key of ['x', 'y', 'settingsX', 'settingsY'] as const) {
    if (Number.isInteger(raw[key]) && Math.abs(raw[key] as number) < 100_000) settings[key] = raw[key] as number
  }
  return settings
}

export class SettingsStore {
  current: LinuxSettings
  private file: string
  constructor(directory: string, private log: (message: string, error?: unknown) => void) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    this.file = join(directory, 'settings.json')
    this.current = validatedSettings(null)
    if (existsSync(this.file)) {
      try { this.current = validatedSettings(JSON.parse(readFileSync(this.file, 'utf8'))) }
      catch (error) { this.log('Saved Linux settings could not be read; using defaults', error) }
    }
  }

  /** Atomic replacement, with no credentials or reminder content in the file. */
  save(next: LinuxSettings): void {
    const temporary = `${this.file}.tmp`
    writeFileSync(temporary, JSON.stringify(next, null, 2), { mode: 0o600 })
    renameSync(temporary, this.file)
    this.current = next
  }
}

/** Quote one desktop Exec argument, including field-code escaping. Reject multiline executable paths. */
export function desktopArgument(value: string): string {
  if (/[\r\n\0]/.test(value)) throw new Error('Invalid executable path')
  // Desktop entry parsing unescapes backslashes before the Exec quoting layer.
  return `"${value.replace(/\\/g, '\\\\\\\\').replace(/(["`$])/g, '\\\\$1').replace(/%/g, '%%')}"`
}

export class Autostart {
  private file: string
  constructor(configDirectory: string, private executable: string, private args: string[]) {
    this.file = join(configDirectory, 'autostart', 'ca.persistent.desktop.desktop')
  }

  /** Re-read the desktop's override each time so an externally disabled entry is reflected in Settings. */
  enabled(): boolean {
    if (!existsSync(this.file)) return false
    const content = readFileSync(this.file, 'utf8')
    return !/^Hidden\s*=\s*true\s*$/im.test(content)
      && !/^X-GNOME-Autostart-enabled\s*=\s*false\s*$/im.test(content)
      && /^Exec=/m.test(content)
  }

  set(enabled: boolean): void {
    if (!enabled) {
      if (existsSync(this.file)) unlinkSync(this.file)
      return
    }
    mkdirSync(join(this.file, '..'), { recursive: true, mode: 0o700 })
    const exec = [this.executable, ...this.args, '--background'].map(desktopArgument).join(' ')
    writeFileSync(this.file, `[Desktop Entry]\nType=Application\nName=Persistent\nExec=${exec}\nTerminal=false\nStartupNotify=false\nX-GNOME-Autostart-enabled=true\n`, { mode: 0o600 })
  }
}
