/**
 * App bootstrap: start the auto-updating service worker, then mount React with
 * the Joy theme, TanStack Query, auth, and the router.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { BrowserRouter } from 'react-router-dom'
import { startServiceWorker } from './lib/appUpdate.js'
import { queryClient, registerMutationDefaults } from './lib/queryClient.js'
import { persistOptions } from './lib/persistQuery.js'
import { AuthProvider } from './auth/useAuth.js'
import { AppThemeProvider } from './settings/AppThemeProvider.js'
import { SettingsProvider } from './settings/useSettings.js'
import { ToastProvider } from './components/ToastProvider.js'
import { ErrorBoundary } from './components/ErrorBoundary.js'
import { NativeLocaleSync } from './native/NativeLocaleSync.js'
import { App } from './App.js'
import { initializeSessionNetwork } from './auth/sessionNetwork.js'
import { startAnalytics } from './lib/analytics.js'
import { isNative } from './native/alarmBridge.js'

// Auto-apply SW updates, and keep *looking* for them: a page that is opened once
// and left running for days never navigates, so it would otherwise never notice a
// new build (see lib/appUpdate.ts).
startServiceWorker()

// Browser-only visit counting, when the server has it configured; never in a native host.
void startAnalytics(isNative())

// Mutation defaults must exist before any persisted offline mutation resumes.
initializeSessionNetwork()
registerMutationDefaults()

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root')

createRoot(container).render(
  <React.StrictMode>
    <SettingsProvider>
      <AppThemeProvider>
        <ErrorBoundary>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={persistOptions}
          >
            <BrowserRouter>
              <AuthProvider>
                <NativeLocaleSync />
                <ToastProvider>
                  <App />
                </ToastProvider>
              </AuthProvider>
            </BrowserRouter>
          </PersistQueryClientProvider>
        </ErrorBoundary>
      </AppThemeProvider>
    </SettingsProvider>
  </React.StrictMode>,
)
