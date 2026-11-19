/**
 * zod settings for the browser. main.tsx imports this module first, so it runs before any
 * schema exists.
 *
 * zod 4 compiles object parsers with `new Function` and probes for it when the first object
 * schema is created. The production CSP has no 'unsafe-eval', so that probe is reported as a
 * violation. `jitless` keeps zod on its interpreted parser in the browser. The API and the
 * Linux host's main process have no such policy and keep the compiled parsers.
 */
import { config } from 'zod'

config({ jitless: true })
