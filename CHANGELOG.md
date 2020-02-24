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
