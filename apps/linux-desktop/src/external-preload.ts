/** Authentication popups get trusted-link handling without the hosted app's privileged bridge. */
import { observeExternalLinks } from './external-links.js'
if (process.isMainFrame) {
  const server = process.argv.find((argument) => argument.startsWith('--persistent-server-origin='))?.slice('--persistent-server-origin='.length)
  if (server) observeExternalLinks(server)
}
