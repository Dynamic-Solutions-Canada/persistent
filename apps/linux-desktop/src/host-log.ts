/** File-only diagnostics must survive launchers closing stdout/stderr after activation. */
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

export function createHostLog(directory: string): (message: string, error?: unknown) => void {
  return (message, error) => {
    const detail = error instanceof Error ? ` (${error.name})` : ''
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 })
      const file = join(directory, 'host.log')
      if (existsSync(file) && statSync(file).size > 1_000_000) renameSync(file, `${file}.previous`)
      appendFileSync(file, `${new Date().toISOString()} ${message}${detail}\n`, { mode: 0o600 })
    } catch { /* Diagnostic failures must never terminate the resident host. */ }
  }
}
