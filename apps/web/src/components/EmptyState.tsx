/**
 * Compact reusable empty-state surface for dashboard pages and lists.
 *
 * printstream's component (UI-13), restyled with Joy theme tokens in place of its own until
 * web-app-kit ships it; the name, props and layout are identical, so the swap is a drop-in.
 */
import type { ReactNode } from 'react'
import { Box, Card, CardContent, Typography } from '@mui/joy'

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        borderStyle: 'dashed',
        borderColor: 'neutral.outlinedBorder',
        backgroundColor: 'background.level1',
      }}
    >
      <CardContent
        sx={{
          alignItems: 'center',
          textAlign: 'center',
          py: compact ? { xs: 0.75, sm: 1 } : { xs: 1.5, sm: 2 },
          px: compact ? { xs: 0.5, sm: 0.75 } : { xs: 1, sm: 1.5 },
          gap: compact ? 0.75 : 1.25,
        }}
      >
        <Box
          sx={{
            width: compact ? 44 : 52,
            height: compact ? 44 : 52,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            color: 'primary.softColor',
            backgroundColor: 'primary.softBg',
            border: '1px solid',
            borderColor: 'primary.outlinedBorder',
          }}
        >
          {icon}
        </Box>
        <Typography level={compact ? 'title-sm' : 'title-md'}>
          {title}
        </Typography>
        <Typography
          level="body-sm"
          textColor="text.tertiary"
          sx={{ maxWidth: compact ? 380 : 440 }}
        >
          {description}
        </Typography>
        {action}
      </CardContent>
    </Card>
  )
}
