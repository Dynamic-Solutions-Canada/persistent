# Devkit development

## Devkit v0.15 runtime selection

Development entrypoints use `devkit run` and Paseo invokes the checkout-local Devkit launcher.
Worktree setup uses the source checkout's Devkit binary until target dependencies are installed,
while selecting the target worktree's `.nvmrc`. Installed Node versions are selected automatically;
exact npm pins are checked before installation. Missing runtimes fail with an actionable error.
Projects without `.nvmrc` retain their current runtime. Devkit never installs Node/npm or changes
nvm's default. Preparation installs checkout-local dependencies without starting services.
