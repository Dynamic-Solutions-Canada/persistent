import { useTranslation } from 'react-i18next'
import { formatNumber } from '../lib/format.js'
/** Count shown on Share buttons for active recipients and pending invitations. */
import Chip from '@mui/joy/Chip'

export function ShareCountChip({ count }: { count: number }) {
  useTranslation()
  return <Chip component="span" size="sm" variant="soft">{formatNumber(count)}</Chip>
}
