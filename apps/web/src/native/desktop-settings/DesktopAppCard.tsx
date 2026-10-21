/**
 * How the Windows tray app itself behaves: whether it starts with Windows, whether
 * its window stays open, and how large it opens. Plus the way into the native
 * window that keeps what cannot live in here.
 */
import { useTranslation, Trans } from 'react-i18next'
import { tr } from '../../localization/i18n.js'
import Card from '@mui/joy/Card'
import Box from '@mui/joy/Box'
import Typography from '@mui/joy/Typography'
import Button from '@mui/joy/Button'
import Switch from '@mui/joy/Switch'
import Select from '@mui/joy/Select'
import Option from '@mui/joy/Option'
import FormControl from '@mui/joy/FormControl'
import FormLabel from '@mui/joy/FormLabel'
import FormHelperText from '@mui/joy/FormHelperText'
import { openHostSettingsWindow } from '../desktopBridge.js'
import type { HostSettingsProps } from './types.js'

export function DesktopAppCard({ settings, update }: HostSettingsProps) {
  useTranslation()
  const linux = settings.platform === 'linux'
  return (
    <Card variant="outlined">
      <Typography level="title-sm">{linux ? tr("Linux app") : tr("Windows app")}</Typography>

      <FormControl orientation="horizontal" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <FormLabel>{tr("Start at sign-in")}</FormLabel>
          <Typography level="body-xs"><Trans i18nKey={"Keeps Persistent in the notification area. Off means no tray icon, and no <v0/> notifications, until you launch it."} components={{ v0: <>{linux ? 'Linux' : 'Windows'}</> }} /></Typography>
        </Box>
        <Switch checked={settings.startAtSignIn} onChange={(e) => update({ startAtSignIn: e.target.checked })} />
      </FormControl>

      {settings.flyoutPlacement && (
        <FormControl>
          <FormLabel>{tr("Open window")}</FormLabel>
          <Select
            value={settings.flyoutPlacement}
            onChange={(_e, value) => value !== null && update({ flyoutPlacement: value })}
          >
            <Option value="tray">{tr("Near the tray icon")}</Option>
            <Option value="last">{tr("Where I left it")}</Option>
            <Option value="center">{tr("Center of tray screen")}</Option>
          </Select>
          <FormHelperText>{tr("Drag the window by its top bar to set a saved position.")}</FormHelperText>
        </FormControl>
      )}

      {linux && !settings.flyoutPlacement && (
        <Typography level="body-xs">{tr("Wayland chooses where this window opens.")}</Typography>
      )}
      <FormControl orientation="horizontal" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <FormLabel>{tr("Keep the window open")}</FormLabel>
          <Typography level="body-xs">{tr("Normally it closes when you click elsewhere. Pin it while you're writing a reminder so a stray click doesn't lose your work.")}</Typography>
        </Box>
        <Switch checked={settings.pinFlyout} onChange={(e) => update({ pinFlyout: e.target.checked })} />
      </FormControl>

      <FormControl>
        <FormLabel>{tr("Window size")}</FormLabel>
        <Select
          value={settings.flyoutSize}
          onChange={(_e, value) => value !== null && update({ flyoutSize: value })}
        >
          {settings.flyoutSizes.map((size) => {
            // One string for both the list and the closed button. `label` is what
            // Joy renders once a value is picked, so passing the bare name there
            // while showing the dimensions in the list meant "Custom" collapsed to
            // exactly the case that needs its numbers: a size with no preset name.
            const text = tr("{{v0}} ({{v1}} x {{v2}})", { v0: size.label, v1: size.width, v2: size.height })
            return (
              <Option key={size.id} value={size.id} label={text}>
                {text}
              </Option>
            )
          })}
        </Select>
        <FormHelperText>{tr("How large this window opens.")}</FormHelperText>
      </FormControl>

      <Box>
        <Typography level="body-xs" sx={{ mb: 1 }}>{tr("The server this app connects to, the version it's running, its log folder and the theme of its own window are in a separate window, because you may need them when this page can't load.")}</Typography>
        <Button variant="outlined" color="neutral" size="sm" onClick={openHostSettingsWindow}><Trans i18nKey={"More <v0/> app settings"} components={{ v0: <>{linux ? 'Linux' : 'Windows'}</> }} /></Button>
      </Box>
    </Card>
  )
}
