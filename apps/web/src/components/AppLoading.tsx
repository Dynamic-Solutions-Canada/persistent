/** Shared startup surface, keeping cached content hidden until the app can safely show it. */
import { useTranslation } from 'react-i18next'
import { tr } from '../localization/i18n.js'
import { Box, CircularProgress } from '@mui/joy'

export function AppLoading() {
  useTranslation()
  return (
    <Box role="status" aria-label={tr("Loading reminders")} sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh' }}>
      <CircularProgress />
    </Box>
  )
}
