# Security

## Reporting

Email ali@alibosworth.com. Please do not open a public issue for a security problem.

PPRC is maintained by one person, so there is no bounty programme and no guaranteed
response time. Reports are read and taken seriously.

## What the realistic surface is

PPRC is a local batch tool. It reads `.raw` files from a directory you point it at,
writes TIFFs and a log to an output directory, and reads and writes settings under
`~/.pprc`. It exposes no server and no network listener. The one outbound request is
the npm version check, which can be disabled by setting `NO_UPDATE_NOTIFIER=1`.

The areas most worth scrutiny:

- Path handling for `--dir` and `--dir-out`, including the `INPUT_DIR` placeholder and
  relative paths, where a crafted value could write outside the intended directory.
- Named values for `--profile`, `--save-profile`, `--use-config`, and `--save-config`,
  which become filenames under `~/.pprc`.
- Parsing of the raw file header in `index.js`, and the deplanarising loop in
  `lib/convert-worker.js`, which read attacker-influenced sizes and offsets from file
  contents.
- The macOS Quick Action installer in `lib/macos-service.js`, which generates a shell
  script and AppleScript that receive a folder path chosen in Finder.

## Out of scope

- ATLAS, the inversion engine, ships as a prebuilt binary from
  `@alibosworth/atlas-node`. Its source is not in this repository. Report anything
  affecting it to the same address and it will be routed.
- Vulnerabilities in Node.js itself, or in dependencies where the fix belongs upstream.
  Reporting them is still appreciated, but the fix will usually be a version bump.

## Supported versions

Fixes go into the current release line. Versions up to 0.0.13, which were published
under GPL-3.0 and use a different processing pipeline, are not maintained.
