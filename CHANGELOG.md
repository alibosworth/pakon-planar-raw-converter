# 1.0.0

Large update which brings simplified installation, faster speeds, better default results, and more flexibility. 

Previously the inversion and orange mask removal was handled internally by a tool called negfix8 which has now been replaced with my own tool based on negfix8's core inversion process but brings many improvements:

- No ImageMagick dependency for easier install
- Parallel processing for faster batch conversion
- Improved performance: typically 2x faster before the parallel processing improvements and 6-10x faster with them
- Defaults to whole-roll calculations for the orange mask, leading to more accurate and consistent color inversion
- Default to slight clipping (0.1%) during contrast stretch to prevent dust specks and specular highlights from pulling the stretch endpoints and producing poor results
- Automatic outlier frame rejection — backlit or unusual frames are detected and excluded from shared profiling to prevent color casts
- Tunable outlier rejection (light/dark pixels) so large dust spots don't throw off color balance
- Automatic detection of narrow-density negatives where default clipping may be too aggressive, with a warning and suggested alternative settings
- Independent control of shadow and highlight clip percentages, rather than just contrast stretch on/off
- By default it removes the intermediate tiffs but you can still keep them if you want
- Allows persistent global configuration of options so you can save your preferences to be used automatically
- Includes a [web based implementation](https://negpro.pages.dev/) for immediate inversion of scans without any installation required

Additionally PPRC will now check for headers on the TLXClientDemo .raw files and if present use the dimension information within them.  This means that as long as you enable "Add File Headers" in TLXClientDemo when saving files, you will never need to pass `--dimensions` when you are scanning XPan, half-frame, or other non-standard sizes.

Additional new features:

- **macOS Finder Quick Action** — `pprc --install-quick-action` adds a `🎞️ Process with PPRC` right-click option for folders in Finder. Opens Terminal with `pprc --dir` so you can see progress. Use `--uninstall-quick-action` to remove.
- **Flexible output directory** — `--dir-out` now supports the `DIR_NAME` placeholder (replaced with input folder name) and relative paths. Start with `../` to place output beside the input folder. Auto-increment (`out`, `out_2`, `out_3`, etc.) applies to all relative paths when the directory already exists.
- **PPRC global config** — save default settings in `~/.pprc/config.json` (e.g. `{"dirOut": "../DIR_NAME_pprc_out"}`). CLI flags always override config values. Settings loaded from config are displayed at startup. After each run, effective settings are saved to `~/.pprc/last_run_config.json` for easy reuse.
- **Clipping risk warnings** — pprc now warns when contrast stretch clipping may be too aggressive for narrow density range images, with a suggestion to use `--clip`
- **CLI help improvements** — options are now grouped by category (Input/Output, Processing Mode, Tuning, etc.) and `pprc --examples` shows usage examples

New options

- `--dir` — process raw files from a specified directory
- `--dir-out` — specify output directory with support for `DIR_NAME` template and relative paths (replaces `--output-dir`)
- `--no-frame-rejection` — disable outlier frame rejection
- `--install-quick-action` / `--uninstall-quick-action` — install/remove macOS Finder Quick Action
- `--clip <percent>` — clip both black and white ends by N% during contrast stretch
- `--clip-black <percent>` / `--clip-white <percent>` — clip shadows and highlights separately
- `--examples` — show usage examples
- `--e6` — skip negative inversion, apply auto-level (for positive/slide film scans)

Renamed options

- `--no-invert` replacing `--no-negfix`
- `--dir-out` replacing `--output-dir`

There are some minor "breaking" changes to be aware of:

- By default image analysis is averaged across all files in a batch and then applied to every image. This leads to more consistent images frame to frame.  You can opt back into the old approach where every image is analyzed individually with `--per-image-balancing`
- Intermediate raw tiffs are no longer created during the process.  If you want them you can run `pprc --no-invert`


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
