# 1.0.0

Large update which brings simplified installation, faster speeds, better default results, and more flexibility.  There are some minor breaking changes to be aware of:

- By default image analysis is averaged across all files in a batch and then applied to every image. This leads to more consistent images frame to frame.  You can opt back into the old approach where every image is analyzed individually with `--per-image-balancing`
- By default intermediate tiffs are deleted, leaving you just with your original .raw files and the output dir of inverted tiffs.  If for whatever reason you want the intermediate tiffs to remain you can pass `--keep-intermediate-tiffs`

negfix8 has been replaced with my own new tool called [negpro](https://github.com/alibosworth/negpro) which is based on negfix8's core inversion process but brings improvements:

- no ImageMagick dependency to ease installation
- Parallel processing for faster batch processing
- tunable outlier rejection (light/dark pixels) means that large dust spots don't throw off the color balance
- customizable tuning of both light and dark clip percentage (rather than just general contrast stretch on/off)
- Allows persistent global configuration of options so you can save your preferences to be used automatically
- Includes a [web based implementation](https://negpro.pages.dev/) for immediate inversion of scans without any installation required

Additionally PPRC will check for headers on the TLXClientDemo .raw files and if present use the dimension information within them.  This means that as long as you enable "Add File Headers" in TLXClientDemo when saving files, you will never need to pass `--dimensions` when you are scanning XPan or half-frame images.

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
