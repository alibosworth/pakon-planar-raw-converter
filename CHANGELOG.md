# 1.0.0

Large update bringing simplified installation, significantly faster speeds, better default results, and more flexibility.

Previously the inversion and orange mask removal was handled by a third-party tool called negfix8. That has been replaced with a purpose-built processing engine with many improvements:

- No ImageMagick or sharp dependency: PPRC is pure JavaScript, the processing engine is a rust binary
- Parallel worker-thread processing: raw files are converted to RGB16 buffers and passed directly to the processing engine with no intermediate TIFF files
- ~40–50x faster than the legacy negfix8 + ImageMagick pipeline
- Whole-roll analysis: a single shared color profile is computed across all frames for more accurate and consistent results
- Automatic outlier frame rejection: backlit or unusual frames are excluded from shared profiling so they don't skew the rest of the roll
- Percentile-based pixel rejection: ignores the brightest/darkest pixels (default 0.1%) to prevent dust and specular highlights from affecting the profile
- Clipping risk detection: warns when narrow-density negatives may clip too aggressively, with suggested alternative settings
- Independent control of shadow and highlight clip percentages via `--clip-black` and `--clip-white`
- Named inversion profiles: analyze a reference roll once and reuse the result across future rolls of the same film stock
- Persistent global configuration: save your preferred options to be applied automatically on every run

Additionally PPRC will now check for headers on TLXClientDemo `.raw` files and if present use the dimension information within them. This means that as long as you enable "Add File Headers" in TLXClientDemo when saving files, you will never need to pass `--dimensions` when scanning XPan, half-frame, or other non-standard sizes.

Additional new features:

- **macOS Finder Quick Action**: `pprc --install-quick-action` adds a `🎞️ Process with PPRC` right-click option for folders in Finder. Opens Terminal with `pprc --dir` so you can see progress. Use `--uninstall-quick-action` to remove.
- **Flexible output directory**: `--dir-out` supports the `INPUT_DIR` placeholder (replaced with the input folder name) and relative paths. Start with `../` to place output beside the input folder. Auto-increments (`out`, `out_2`, `out_3`, etc.) when the directory already exists.
- **Global config**: save default settings to `~/.pprc/configs/default.json` via `--save-config`. CLI flags always override config values. Settings loaded from config are displayed at startup.
- **Named configs**: save and load named option sets with `--save-config <name>` / `--use-config <name>`.
- **Clipping risk warnings**: warns when contrast stretch clipping may be too aggressive for narrow-density negatives, with a suggestion to reduce `--clip`.
- **CLI help improvements and examples**: options are now grouped by category (Input/Output, Processing Mode, Tuning, etc.) and `pprc --examples` shows usage examples.

New options

- `--dir`: process raw files from a specified directory
- `--dir-out`: specify output directory with `INPUT_DIR` template and relative path support (replaces `--output-dir`)
- `--mode <mode>`: processing mode: `negative` (default), `raw`, `e6`, `bw`, `bw-rgb` (replaces `--e6`, `--bw`, `--bw-rgb`)
- `--no-stretch`: disable contrast stretch entirely
- `--border-exclude <percent>`: exclude the outer % of each image from profiling and contrast stretch calculations (default: 2)
- `--pixel-rejection-percentage <percent>`: ignore the brightest/darkest % of pixels per frame when computing the shared color profile (default: 0.1)
- `--per-image-balancing`: compute a separate inversion profile per frame instead of sharing one across the roll
- `--no-frame-rejection`: disable automatic outlier frame rejection
- `--clip <percent>`: clip both black and white ends by N% during contrast stretch
- `--clip-black <percent>` / `--clip-white <percent>`: clip shadows and highlights separately
- `--output-gamma <value>`: output gamma applied during inversion (replaces `--gamma1`)
- `--save-profile <name>`: analyze input files, save the computed inversion profile, then exit
- `--profile <name>`: use a previously saved inversion profile instead of analyzing the current batch
- `--save-config [name]`: save current CLI options to `~/.pprc/configs/default.json` (or `<name>.json`) and exit
- `--use-config <name>`: load a named config instead of the default
- `--install-quick-action` / `--uninstall-quick-action`: install/remove macOS Finder Quick Action
- `--examples`: show usage examples

Renamed options

- `--dir-out` replaces `--output-dir`
- `--mode raw` replaces `--no-negfix` / `--no-invert`

Deprecated options (still work, show a warning)

- `--e6`, `--bw`, `--bw-rgb` — use `--mode e6`, `--mode bw`, `--mode bw-rgb` instead
- `--gamma1` — use `--output-gamma 1` instead

Breaking changes

- By default, image analysis is now shared across all frames in a batch, producing more consistent results frame to frame. To analyze each image individual as before, use `--per-image-balancing`.
- The pipeline no longer creates intermediate TIFF files. Raw files are converted to pixel buffers in memory and passed directly to the processing engine. To get raw 16-bit TIFFs for use with another tool (Negative Lab Pro, ColorPerfect, etc.), use `pprc --mode raw`.
- Contrast stretch now clips 0.001% on each end by default. Without clipping, a single dust speck or blown highlight can anchor the stretch endpoint, compressing all of the real film data into a fraction of the available tonal range. The default 0.001% clip is conservative enough to be invisible in normal images while preventing outliers from degrading the result. Use `--clip 0` to disable clipping, or `--no-stretch` to disable contrast stretch entirely.
- Output TIFFs are now tagged with an AdobeRGB-compatible ICC profile. The profile may appear as "ClayRGB" in some applications — this is Elle Stone's name for the AdobeRGB-1998 primaries (same D65 whitepoint and gamut, named to avoid the Adobe trademark).


# 0.1.0

Replace negfix8 with a new library called negpro that is faster and has more features

# 0.0.13 

Add option `--gamma1` to avoid applying a gamma correction of 2.2 to the raw file

# 0.0.12

Correct documentation of `--output-dir` option which was previously incorrectly documented as `--output-directory`

# 0.0.10

Add `--bw` and `--bw-rgb` options which skip negfix8 and instead invert and auto-level via Imagemagick.  `--bw` saves in a grey-scale colorspace while `--bw-rgb` leaves it in a RGB one.

# 0.0.8

Switch to saving initial TIFF with interleaved pixel order rather than rather per-channel

# 0.0.7

Support E6 workflow by not inverting

# 0.0.6

Publish to npmjs.org, update readme.

# 0.0.5

Stop calling Negfix8 in parallel because it can break things

# 0.0.4

Allow specification of non-standard image dimensions (useful for manual frame sizes with XPan etc)

# 0.0.3

Allow skipping the dependency check (The check is broken in Windows XP)

# 0.0.2

Support use in Windows

# 0.0.1

Initial release
