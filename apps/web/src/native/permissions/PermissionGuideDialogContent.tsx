/**
 * The permission guide's dialog: explain one Android alarm grant at a time, then
 * open the system screen that changes it only when the user presses Continue.
 *
 * Props-driven (readiness, re-check and launch come from the caller) so it renders
 * in tests without Android; `PermissionGuideDialog` wires the real bridge.
 *
 * Used for a single grant (a banner button) and for several in turn. Progress is
 * driven by readiness re-reads (see `permissionGuide.ts`): returning from settings
 * re-checks and moves on, or says the grant is still off. Not now is always
 * available, so a declined or unopenable screen never traps the user.
 */
import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import Button from '@mui/joy/Button'
import DialogActions from '@mui/joy/DialogActions'
import DialogContent from '@mui/joy/DialogContent'
import DialogTitle from '@mui/joy/DialogTitle'
import ModalDialog from '@mui/joy/ModalDialog'
import Stack from '@mui/joy/Stack'
import Typography from '@mui/joy/Typography'
import { tr } from '../../localization/i18n.js'
import { notify } from '../../lib/toast.js'
import { BackAwareModal } from '../../components/BackAwareModal.js'
import { grantCopy, isFullySetUp, routeFor, type AlarmGrant, type AlarmReadiness, type GrantRoute } from './alarmGrants.js'
import { guideReducer, initialGuide, isGuideFinished, type GuideState } from './permissionGuide.js'

export interface PermissionGuideOutcome {
  /** Grants still missing that the user put off; the banner keeps showing them. */
  declined: AlarmGrant[]
  /** Grants whose explanation the user actually saw, in order. */
  shown: AlarmGrant[]
}

export interface PermissionGuideDialogProps {
  /** The grants this guide may ask for. Those already granted are skipped. */
  scope: readonly AlarmGrant[]
  /** Called once when nothing is left to ask, or the user closes the guide. */
  onClose: (outcome: PermissionGuideOutcome) => void
}

interface PermissionGuideDialogContentProps extends PermissionGuideDialogProps {
  /** Latest readiness read, or null before the first one. A new value drives the next step. */
  readiness: AlarmReadiness | null
  /** Re-read readiness (Check again, after a prompt answers); resolves with the read, or null. */
  refresh: () => Promise<AlarmReadiness | null>
  /** Open the prompt or screen for a grant; resolves with whether anything opened. */
  launch: (grant: AlarmGrant, route: GrantRoute) => Promise<boolean>
}

/** A guide over `scope`, already applied to readiness the caller holds, so it can open on its first render. */
function startGuide({ scope, readiness }: { scope: readonly AlarmGrant[]; readiness: AlarmReadiness | null }): GuideState {
  const guide = initialGuide(scope)
  return readiness ? guideReducer(guide, { type: 'readiness', readiness }) : guide
}

/**
 * The guide dialog, driven entirely by props so it renders in tests without Android.
 *
 * The modal stays mounted and closes through `open`, never by unmounting:
 * `BackAwareModal` pops the history entry it pushed only on an open-to-closed
 * change, and an unmounted modal would leave that entry to swallow the next Back.
 */
export function PermissionGuideDialogContent({ scope, onClose, readiness, refresh, launch: launchGrant }: PermissionGuideDialogContentProps) {
  useTranslation()
  const [state, dispatch] = useReducer(guideReducer, { scope, readiness }, startGuide)
  const [launching, setLaunching] = useState(false)
  const asked = useRef(false)
  const closed = useRef(false)

  // Every readiness read (resume, Check again, another reader's refresh) drives the next step.
  useEffect(() => {
    if (readiness) dispatch({ type: 'readiness', readiness })
  }, [readiness])

  /** Close at most once, reporting what the user put off and what they saw. */
  const finish = useCallback(
    (finalState: GuideState) => {
      if (closed.current) return
      closed.current = true

      const remaining = finalState.current ? [...finalState.declined, finalState.current] : [...finalState.declined]
      // Confirm only when the guide asked for something and every grant, not just
      // this guide's scope, is now held; otherwise the banner still has work to show.
      if (asked.current && finalState.readiness && isFullySetUp(finalState.readiness)) {
        notify(tr("Alarms are fully set up"), 'success')
      }
      onClose({ declined: remaining, shown: [...finalState.shown] })
    },
    [onClose]
  )

  // Runs after the modal's own effect has seen open become false and popped its entry.
  useEffect(() => {
    if (isGuideFinished(state)) finish(state)
  }, [state, finish])

  const grant = state.current

  /** Open the prompt or screen for the grant on screen; the outcome comes from readiness. */
  const launch = async (target: AlarmGrant, route: GrantRoute) => {
    asked.current = true
    setLaunching(true)
    try {
      if (route === 'prompt') {
        // The prompt keeps the app in front, and it resolves once answered.
        dispatch({ type: 'launched', grant: target, route, opened: true })
        await launchGrant(target, route)
        await refresh()
        return
      }

      const opened = await launchGrant(target, route)
      if (!opened) {
        // Nothing opened also means "already granted"; re-check before blaming the phone.
        const fresh = await refresh()
        if (fresh) dispatch({ type: 'readiness', readiness: fresh })
      }
      dispatch({ type: 'launched', grant: target, route, opened })
    } finally {
      setLaunching(false)
    }
  }

  return (
    <BackAwareModal open={grant !== null} onClose={() => finish(state)}>
      <ModalDialog sx={{ width: 'min(480px, calc(100vw - 32px))' }}>
        {grant && (
          <GuideStep
            grant={grant}
            state={state}
            launching={launching}
            onLaunch={(route) => void launch(grant, route)}
            onCheckAgain={() => void refresh()}
            onNotNow={() => dispatch({ type: 'notNow' })}
          />
        )}
      </ModalDialog>
    </BackAwareModal>
  )
}

/** One grant's explanation, phase message and actions. */
function GuideStep({ grant, state, launching, onLaunch, onCheckAgain, onNotNow }: {
  grant: AlarmGrant
  state: GuideState
  launching: boolean
  onLaunch: (route: GrantRoute) => void
  onCheckAgain: () => void
  onNotNow: () => void
}) {
  const copy = grantCopy(grant)
  const route = routeFor(grant, state.promptTried.includes(grant))

  return (
    <>
      <DialogTitle>{tr(copy.title)}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          <Typography>{tr(copy.why)}</Typography>
          <PhaseMessage phase={state.phase} instructions={tr(copy.instructions[route] ?? '')} manualPath={tr(copy.manualPath)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="plain" color="neutral" onClick={onNotNow}>
          {tr("Not now")}
        </Button>
        {state.phase === 'explain' && (
          <Button loading={launching} onClick={() => onLaunch(route)}>{tr("Continue")}</Button>
        )}
        {state.phase === 'stillOff' && (
          <Button loading={launching} onClick={() => onLaunch(route)}>{tr("Try again")}</Button>
        )}
        {(state.phase === 'waiting' || state.phase === 'unavailable') && (
          <Button variant="soft" onClick={onCheckAgain}>{tr("Check again")}</Button>
        )}
      </DialogActions>
    </>
  )
}

/** The second paragraph: what happens next, or what went wrong, for the current phase. */
function PhaseMessage({ phase, instructions, manualPath }: { phase: GuideState['phase']; instructions: string; manualPath: string }) {
  switch (phase) {
    case 'explain':
      return <Typography level="body-sm">{instructions}</Typography>
    case 'waiting':
      return <Typography level="body-sm">{tr("When you're done, come back to Persistent. This updates by itself.")}</Typography>
    case 'stillOff':
      return (
        <Typography level="body-sm">
          {tr("It's still off.")} {instructions}
        </Typography>
      )
    case 'unavailable':
      return (
        <Typography level="body-sm">
          {tr("This phone didn't open that screen. You can turn it on yourself in {{v0}}.", { v0: manualPath })}
        </Typography>
      )
  }
}
