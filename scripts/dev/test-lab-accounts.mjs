/** Shared identity boundary for every disposable capture-fixture operation. */
export const DEMO_EMAIL = 'ryan.ewen+persistentdemo@gmail.com'
export const FIXTURE_EMAILS = Object.freeze(['alex@example.test', DEMO_EMAIL])

/** Reject personal, missing or duplicated accounts before exposing or operating a fixture database. */
export function assertSyntheticAccounts(users, demoMode) {
  const emails = users.map((user) => user.email).sort()
  if (demoMode !== 'true' || JSON.stringify(emails) !== JSON.stringify(FIXTURE_EMAILS)) {
    throw new Error('Capture operations require the isolated two-account demo database.')
  }
}
