# TODO

## Pending

- [ ] macOS Finder Quick Action: `pprc --install-service` / `--uninstall-service` to add a right-click "Process with PPRC" option for folders. Previous attempt used Run AppleScript action but workflow failed to load. Need to model after working Negfix8.workflow (uses Run Shell Script action). Should open a Terminal window so user can see pprc output. Must bake in absolute node/pprc paths at install time so it works regardless of user's shell config.
- [ ] Split index.js into smaller files
- [ ] Update commander from v2 to latest (enables addHelpText and other modern features)
- [ ] Update docs with what pprc is NOT
- [ ] Add update notifications via [update-notifier](https://www.npmjs.com/package/update-notifier)
- [ ] Explore TIFF compression options for output files
- [ ] If negpro global config (~/.negpro/config.json) influences settings, show the user a message indicating which settings are being used from their config
- [ ] Fix deprecated dependency warnings: update glob (v7 has security vulnerabilities), replace inflight (memory leak, no longer supported)

## Completed
