/** Reconcile the native OS picker before publishing an older web preference back to Android. */
import { nativeLanguageStateSchema, type Locale, type NativeLanguageState } from '@persistent/shared'

export interface NativeLanguageBridge {
  getLocale(options: { fallbackLanguageOverride: Locale | null }): Promise<NativeLanguageState>
  addListener(event: 'localeChanged', listener: (state: NativeLanguageState) => void): Promise<{ remove(): Promise<void> }>
}

interface Callbacks {
  apply(state: NativeLanguageState): void
  ready(): void
}

/** Only Capacitor's explicit unsupported-method code proves that legacy fallback is appropriate. */
function unsupported(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'UNIMPLEMENTED'
}

/**
 * Subscribe before reading; native events and manual choices invalidate older reads.
 * Slow reads never unlock publishing. Transient failures retry while the web remains
 * usable, and disposal cancels retries/listeners without applying late responses.
 */
export function connectNativeLanguage(bridge: NativeLanguageBridge, fallback: Locale | null, callbacks: Callbacks, retryDelay = 2000) {
  let disposed = false
  let revision = 0
  let receivedNativeState = false
  let listener: { remove(): Promise<void> } | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let listenerRetry: ReturnType<typeof setTimeout> | undefined
  const reported = new Set<string>()

  const warnOnce = (operation: string) => {
    if (reported.has(operation)) return
    reported.add(operation)
    console.warn(`[locale] Native language ${operation} failed; retrying without overwriting the native preference.`)
  }

  const apply = (value: unknown): boolean => {
    const parsed = nativeLanguageStateSchema.safeParse(value)
    if (disposed || !parsed.success) return false
    receivedNativeState = true
    callbacks.apply(parsed.data)
    callbacks.ready()
    return true
  }

  const changed = (state: NativeLanguageState) => {
    if (!nativeLanguageStateSchema.safeParse(state).success) return
    revision += 1
    apply(state)
  }

  const read = async () => {
    const requestedRevision = revision
    try {
      const value = await bridge.getLocale({ fallbackLanguageOverride: fallback })
      if (disposed || requestedRevision !== revision) return
      if (!apply(value)) throw new Error('Invalid native language snapshot')
    } catch (error) {
      if (disposed) return
      if (unsupported(error) && !receivedNativeState) {
        callbacks.ready()
      } else {
        warnOnce('read')
        retry = setTimeout(() => { void read() }, retryDelay)
      }
    }
  }

  const removeListener = async () => {
    try {
      await listener?.remove()
    } catch {
      // Cleanup cannot change readiness; report a safe bounded diagnostic.
      if (!reported.has('cleanup')) console.warn('[locale] Native language listener cleanup failed.')
      reported.add('cleanup')
    }
  }

  const subscribe = async (recovering = false) => {
    try {
      listener = await bridge.addListener('localeChanged', changed)
      if (disposed) await removeListener()
      else if (recovering) {
        // A slow read begun without a listener may predate an unseen OS choice.
        revision += 1
        clearTimeout(retry)
        await read()
      }
    } catch (error) {
      if (disposed || unsupported(error)) return
      warnOnce('subscription')
      listenerRetry = setTimeout(() => { void subscribe(true) }, retryDelay)
    }
  }

  void (async () => {
    await subscribe()
    if (!disposed) await read()
  })()

  return {
    /** An explicit user selection may replace the OS choice, even while the initial read is pending. */
    manualChoice() {
      revision += 1
      callbacks.ready()
    },
    dispose() {
      disposed = true
      clearTimeout(retry)
      clearTimeout(listenerRetry)
      void removeListener()
    }
  }
}
