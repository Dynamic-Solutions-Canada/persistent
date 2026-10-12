/** Shared Store and Linux download actions for Persistent's native apps. */
import Button from '@mui/joy/Button'
import Stack from '@mui/joy/Stack'
import AndroidIcon from '@mui/icons-material/Android'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import WindowRoundedIcon from '@mui/icons-material/WindowRounded'
import { LINUX_DOWNLOADS_URL, PLAY_STORE_URL, WINDOWS_STORE_URL } from './appPromotion.js'

export interface NativeAppButtonsProps {
  showAndroid?: boolean
  showWindows?: boolean
  showLinux?: boolean
}

/** Render the requested native download links, full-width on phones and compact elsewhere. */
export function NativeAppButtons({
  showAndroid = true,
  showWindows = true,
  showLinux = true
}: NativeAppButtonsProps) {
  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      {showAndroid && (
        <Button
          component="a"
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noreferrer"
          size="sm"
          variant="outlined"
          startDecorator={<AndroidIcon />}
          sx={{ width: { xs: '100%', sm: 'auto' } }}
        >
          Google Play
        </Button>
      )}
      {showWindows && (
        <Button
          component="a"
          href={WINDOWS_STORE_URL}
          target="_blank"
          rel="noreferrer"
          size="sm"
          variant="outlined"
          startDecorator={<WindowRoundedIcon />}
          sx={{ width: { xs: '100%', sm: 'auto' } }}
        >
          Microsoft Store
        </Button>
      )}
      {showLinux && (
        <Button
          component="a"
          href={LINUX_DOWNLOADS_URL}
          target="_blank"
          rel="noreferrer"
          size="sm"
          variant="outlined"
          startDecorator={<DownloadRoundedIcon />}
          sx={{ width: { xs: '100%', sm: 'auto' } }}
        >
          Linux downloads
        </Button>
      )}
    </Stack>
  )
}
