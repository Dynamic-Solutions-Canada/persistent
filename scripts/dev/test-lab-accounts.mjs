/** Shared identity boundary for every disposable capture-fixture operation. */
/**
 * The synthetic capture account. Development and test-lab servers run in demo mode, which returns
 * sign-in codes in the response, so the address needs no mailbox and names nobody.
 */
export const DEMO_EMAIL = 'demo@example.test'
export const FIXTURE_EMAILS = Object.freeze(['alex@example.test', DEMO_EMAIL])

/** Reject personal, missing or duplicated accounts before exposing or operating a fixture database. */
export function assertSyntheticAccounts(users, demoMode) {
  const emails = users.map((user) => user.email).sort()
  if (
    demoMode !== 'true' ||
    JSON.stringify(emails) !== JSON.stringify(FIXTURE_EMAILS)
  ) {
    throw new Error(
      'Capture operations require the isolated two-account demo database.',
    )
  }
}
