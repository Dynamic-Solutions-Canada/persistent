/** Server changes and desktop command lines must never widen privileged origin access. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { externalLinkIntent, serverOrigin, isAppUrl, isExternalUrl, isGoogleSignIn } from './security.js'
import { desktopArgument, validatedSettings } from './settings.js'

test('remote origins require HTTPS, dev HTTP is loopback only, and credentials/path data are rejected', () => {
  assert.equal(serverOrigin('https://persistent.dynamic-solutions.ca/'), 'https://persistent.dynamic-solutions.ca')
  assert.equal(serverOrigin('http://127.0.0.1:4000'), 'http://127.0.0.1:4000')
  for (const url of ['http://evil.example', 'file:///tmp/a', 'https://user:password@example.com', 'https://example.com/path', 'https://example.com?q=a']) assert.throws(() => serverOrigin(url))
  assert.equal(isAppUrl('https://example.com.evil/a', 'https://example.com'), false)
  assert.equal(isExternalUrl('javascript:alert(1)'), false)
  assert.equal(isGoogleSignIn('https://accounts.google.com.evil/'), false)
})

test('settings discard unbounded and unknown web fields without persisting secrets', () => {
  const settings = validatedSettings({ server: 'http://evil.example', notifications: 'true', width: -1, height: Infinity, sessionCookie: 'secret', placement: 'unknown' })
  assert.equal(settings.server, 'https://persistent.dynamic-solutions.ca')
  assert.equal(settings.notifications, false)
  assert.equal(settings.width, 420)
  assert.equal('sessionCookie' in settings, false)
  assert.equal(settings.placement, 'tray')
})

test('desktop Exec quoting escapes field codes, shell metacharacters and refuses multiline paths', () => {
  assert.equal(desktopArgument('/tmp/app with spaces'), '"/tmp/app with spaces"')
  assert.equal(desktopArgument('name%U'), '"name%%U"')
  assert.ok(desktopArgument('$(echo hi)').includes('\\\\$'))
  assert.throws(() => desktopArgument('/tmp/app\nExec=evil'))
})

test('local settings theme and window geometry cannot overwrite reminder or credential state', () => {
  const saved = validatedSettings({ appTheme: 'dark', settingsWidth: 760, settingsHeight: 600, settingsX: -1200, settingsY: 40 })
  assert.equal(saved.appTheme, 'dark')
  assert.equal(saved.settingsX, -1200)
  const rejected = validatedSettings({ appTheme: 'unknown', settingsWidth: -50, settingsHeight: Infinity, settingsX: 500000, sessionCookie: 'secret' }, saved)
  assert.equal(rejected.appTheme, 'dark')
  assert.equal(rejected.settingsWidth, 760)
  assert.equal(rejected.settingsHeight, 600)
  assert.equal(rejected.settingsX, -1200)
  assert.equal('sessionCookie' in rejected, false)
})

test('Google sign-in uses its exact credential-free HTTPS origin', () => {
  assert.equal(isGoogleSignIn('https://accounts.google.com/login'), true)
  assert.equal(isGoogleSignIn('https://accounts.google.com:8443/login'), false)
  assert.equal(isGoogleSignIn('https://user:pass@accounts.google.com/login'), false)
})

test('only a trusted external anchor activation can request a browser launch', () => {
  assert.equal(externalLinkIntent(false, 'https://external.example', 'https://app.example'), null)
  assert.equal(externalLinkIntent(true, 'https://app.example/path', 'https://app.example'), null)
  assert.equal(externalLinkIntent(true, 'https://accounts.google.com/login', 'https://app.example'), null)
  assert.equal(externalLinkIntent(true, 'https://user:pass@external.example', 'https://app.example'), null)
  assert.equal(externalLinkIntent(true, 'file:///etc/passwd', 'https://app.example'), null)
  assert.equal(externalLinkIntent(true, 'https://external.example/path', 'https://app.example'), 'https://external.example/path')
})
