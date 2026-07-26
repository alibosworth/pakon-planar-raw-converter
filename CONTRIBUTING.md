# Contributing

Issues and suggestions are welcome. Bug reports, feature ideas, questions about
scanning workflow, and reports of raw files PPRC cannot read are all useful, and
opening an issue is the best way to send them.

## Please ask before opening a code pull request

PPRC is released under the [PolyForm Noncommercial License 1.0.0](LICENSE), and may
be offered under a separate commercial licence in future. Outside code merged into
the project would leave parts of it under someone else's copyright, which makes that
harder to do cleanly. So the policy is deliberately conservative:

- Open an issue first and check the change fits the project's direction.
- By submitting a pull request, you agree the contribution may be used, relicensed,
  and commercially licensed by the maintainer as part of the project.
- If you are not comfortable with that, please open an issue rather than a pull
  request. A clear description of the problem is genuinely more useful than a patch
  that cannot be merged.
- Pull requests that do not fit the project's licensing or product direction may be
  declined or closed.

None of this is meant to discourage you from reporting things. It only applies to
merging code.

## Filing a good bug report

The scanner, the export settings, and the raw files matter as much as the command
you ran. Where relevant, include:

- The output of `pprc --version`, your operating system, and your Node.js version.
- The exact command you ran.
- `pprc_log.txt` from the output directory. It records the settings, the profile
  values, per-frame diagnostics, and the file list, and it is usually the fastest
  route to an answer.
- How the files were saved out of TLXClientDemo, in particular whether "Planar" and
  "Add File Header" were enabled.
- For a colour or inversion problem, whether the whole roll was processed together
  or only a few frames.

If a specific raw file fails, say so and describe it (resolution, frame size, film
stock). Do not attach scans of anything you would not want public.

## Working on the code

```
npm install
npm test
```

The test suite runs on Node 22+ against synthetic raw files, so it needs no scans of
your own. `DEBUG=pprc` in the environment turns on timing output and logs errors that
are otherwise swallowed.
