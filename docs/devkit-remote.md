# Devkit development

## Devkit v0.15 runtime selection

Development entrypoints use `devkit run` and Paseo invokes the checkout-local Devkit launcher.
Worktree setup uses the source checkout's Devkit binary until target dependencies are installed,
while selecting the target worktree's `.nvmrc`. Installed Node versions are selected automatically;
exact npm pins are checked before installation. Missing runtimes fail with an actionable error.
Projects without `.nvmrc` retain their current runtime. Devkit never installs Node/npm or changes
nvm's default. Preparation installs checkout-local dependencies without starting services.

## Worktree archive cleanup (Devkit v0.16)

`npm run dev:down` stops development while keeping its data. `npm run dev:cleanup`
permanently removes this linked worktree's private containers, network, database and
any additional volumes declared in `devkit.config.mjs`. Run `devkit cleanup` first for
a preview. Cleanup refuses primary checkouts, preserves baselines and shared caches,
and leaves directory removal to Paseo or Git.

Paseo's archive teardown calls the source checkout's Devkit CLI with `cleanup --paseo --yes`,
so a worktree whose dependency installation failed can still be cleaned up. Cleanup
checks all active workspace references, including background workspaces, and preserves
resources while another reference exists. If the daemon cannot be queried, cleanup
fails closed. Do not reopen a worktree while it is being archived.

Additional private volumes: `{project}_android-home`.
