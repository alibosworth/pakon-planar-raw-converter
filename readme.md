# Pakon Planar Raw Converter (PPRC)

PPRC is a blazing fast (whole roll in seconds) tool that batch-converts Pakon F135/F135+ "planar" raw files into full 16-bit TIFFs with the orange mask removed giving you the highest-quality starting point for your editing workflow. Extensive customization options (output directory name and location, inversion tuning) can be saved to a global config so every run uses your preferred settings automatically.

<figure>
  <video muted playsinline loop autoplay controls src="https://github.com/user-attachments/assets/146c72cc-9ab9-44ae-bf60-47754c25bcde" width="100%"></video>
  <figcaption>Video of most basic usage (via macOS Quick Action)</figcaption>
</figure>

## Why use PPRC?

The Pakon F135/F135+ captures 15 bits of data per channel internally, but its standard output options throw much of that away. PSI exports are 8-bit even when saving TIFFs. PSI's "raw" exports are quantized 8-bit files. TLXClientDemo.exe can save the full 16-bit planar data, but the resulting `.raw` files aren't directly usable by most tools.

PPRC takes those raw files and:

1. Converts the planar data to standard interleaved 16-bit TIFFs
2. Analyzes the roll to compute a shared color profile
3. Removes the orange mask and inverts the negative
4. Outputs files ready to import into Lightroom, Capture One, Bridge, or any editor that handles 16-bit TIFFs

The result is images that preserve all the data your scanner captured: the best possible starting point for your editing.

For best color consistency, process a whole roll together when possible rather than splitting it into smaller batches. PPRC's default inversion analyzes the batch as a group, which helps keep color balance consistent across frames and makes outlier-frame rejection more reliable.

[Here are some comparisons](https://alibosworth.github.io/pakon-planar-raw-converter/comparison/) of standard PSI output vs PPRC output. And [here are examples](https://alibosworth.github.io/pakon-planar-raw-converter/8bit_raw_highlight_issue/) of the quality issues caused by PSI's 8-bit limitation.


## What PPRC is not

PPRC is not a negative inversion editor — it doesn't offer manual color correction or creative grading controls. Instead, it automatically removes the orange mask and computes a shared color balance across the whole roll, giving you consistent, neutral results ready for editing in your tool of choice. Tools like [Negative Lab Pro](https://www.negativelabpro.com/), [Grain2Pixel](https://grain2pixel.com/), [ColorNeg](https://www.colorperfect.com/colorneg.html), or [NegPy](https://github.com/marcinz606/NegPy) are designed for that.

PPRC's output is intentionally neutral and data-rich rather than punchy or stylized. Images will look flatter than what you'd get from a more aggressive inversion tool, and this is by design. The goal is to preserve maximum editing headroom so you can make decisions yourself via your preferred workflow.

If you want to use your own orange mask removal process, run with `--mode raw` to get linear 16-bit TIFFs to pipe through Negative Lab Pro, ColorPerfect, Vuescan, or any other tool.

## How does the color inversion work?

By default, all images in a batch are analyzed together to compute a shared color profile. This produces more consistent results across a roll than analyzing each frame individually.

During analysis, the very brightest and darkest pixels within each frame are ignored so that dust spots or specular highlights don't skew the profile. Outlier frames (e.g. backlit shots with very different color characteristics) are also automatically detected and excluded from the shared profile so they don't throw off the rest of the roll.

These defaults are designed to produce better roll-wide results, not to be a bit-for-bit archival transform. If you want the closest thing to a straight preservation path, use `--mode raw` to export the Pakon's sensor data as linear 16-bit TIFFs without inversion. If you want to keep the inversion but make it less aggressive, you can tune or disable clipping, contrast stretch, and pixel rejection.

You can tune the inversion behavior with CLI options or save your preferences in a global config file so they're used automatically (see [Global Config](#global-config) below).

---------------------

## FAQ

### I'm not comfortable with using the command line, is it hard?

Once installed, it's a single command. On macOS you can install a Finder Quick Action to get a right-click "Process with PPRC" option — no terminal needed.

### The non-raw files created by PSI or TLXClientDemo look great, why would I want to use this?

PSI's built-in algorithms do produce decent images and some people prefer just using them as is. PSI or TLXCD are working with 16-bit data internally and then discarding half of it when saving to 8-bit. The images are also heavily processed with Kodak's automatic adjustments. PPRC preserves the full 16-bit data and gives you a neutral starting point with more dynamic range and detail to work with in your editor. 

### PSI already exports raw files for me, why use TLXClientDemo?

PSI can only export 8-bit files, even when exporting "raw" TIFFs. This limitation shows up most often as [artifacting and quantization in highlights](https://alibosworth.github.io/pakon-planar-raw-converter/8bit_raw_highlight_issue/). TLXClientDemo's planar raw output preserves the full 16-bit data.

### Can't I just open the planar raw files in Photoshop?

You can, but you'll have to manually specify the image dimensions, channel count, bit-depth, and header offset each time, and then save out to a TIFF. PPRC detects all of this automatically (from file headers or known file sizes) and processes an entire directory at once.

----------------------------------

## Installing

You'll need Node.js v22+ installed, then install PPRC globally:

1) Install Node.js via the installer from [nodejs.org](https://nodejs.org/en/download)

2) Open a terminal:
   - **Mac**: Press CMD-space, type "terminal", hit return
   - **Windows**: Open the Start menu, search for "cmd", run it

3) Install PPRC globally:
   ```
   npm install -g pakon-planar-raw-converter
   ```

#### macOS Finder Quick Action

After installing on a Mac, run `pprc --install-quick-action` to add a Finder Quick Action. You can then right-click any folder of raw files and select "Process with PPRC".

#### Windows XP Note

Please do not try to run PPRC on Windows XP. Everything will be easier and faster if you install this on a more modern operating system. There is no need to run PPRC from the computer you scanned on.

------------------

## Updating

PPRC will attempt to detect and show you a message when there is an update available, but you can update to the latest version at any time with `npm update -g pakon-planar-raw-converter`.

------------------

## Scanning

Here's a quick summary of scanning with TLXClientDemo:

1) Run TLXClientDemo

2) Click "Scan"

3) Choose your scanning options and scan your negatives:

* Select "Film Color": "Negative"
* Choose any Resolution
* Choose the appropriate "Frames Per Strip" option
* Optionally enable "Scratch Removal"
* Click "Scan", let scan complete.

4) Click "Move Oldest Roll in Scan Group To Save Group"

5) You may now review your scans using "Previous" and "Next" and optionally correct framing.

6) Click "Save" and set the save options:

* "All Pictures (except hidden)"
* "Original Height and Width"
* "Other Options": **uncheck everything** except "Use Scratch Removal" if you enabled that earlier
* "Type of Save Operation": "To Client Memory"
* "Planar" with "Add File Header" enabled
* Click "OK"

7) Once this process completes you will now have a `C:\Temp` full of 16-bit Planar Raw files ready to be processed.

* Note: enabling "Scratch Removal" at the scanning and saving steps will allow TLXCD to remove dust and scratches automatically, however there is currently no way to export the IR scan data with your .raw files.*

---------------

## Usage

#### Quick start:

Run `pprc` from the directory containing your `.raw` files, or point it at a directory:

```
pprc
pprc --dir /path/to/raw/files
```

Processed files will be saved to an `out/` subdirectory.

For best results, run PPRC on a full roll together when possible instead of processing a few frames at a time.

#### Step by step:

1) Open your terminal (CMD-space → "terminal" on macOS, or Start → "cmd" on Windows).

2) Navigate to the directory containing your raw files. The easiest way is to type `cd ` (with a space) and then drag the folder into the terminal window.

3) Type `pprc` and press enter. After a few seconds you should have an `out/` directory containing the processed images.

## Options

#### Input/Output

* `--dir [dir]` Process a specific directory of .raw files instead of the current directory.

* `--dir-out [dir]` Specify the output directory (default: `out`, placed inside the input directory). Supports the `INPUT_DIR` placeholder which is replaced with the input folder's name. If the output directory already exists, pprc auto-increments the name (`out`, `out_2`, `out_3`, etc.). Start with `../` to place the output beside the input folder instead of inside it. Absolute paths are used as-is (no auto-increment). Examples:

  * `pprc --dir-out INPUT_DIR_inverted` — output inside input folder as e.g. `myfolder_inverted/`
  * `pprc --dir-out ../INPUT_DIR_pprc_out` — output beside input folder as e.g. `myfolder_pprc_out/`
  * `pprc --dir-out /path/to/output` — output to an absolute path

#### Processing Mode

* `--mode <modes>` Processing mode(s) (default: `negative`). Choices:
  * `negative` — Invert color negative, remove orange mask (default)
  * `raw` — Output unconverted TIFFs for processing with another tool (Negative Lab Pro, ColorPerfect, Vuescan, etc.)
  * `e6` — Slide film — no inversion, apply contrast stretch
  * `bw` — Black & white — invert, contrast stretch, greyscale output
  * `bw-rgb` — Black & white — invert, contrast stretch, RGB output

  You can request several modes at once with a comma-separated list, e.g. `pprc --mode negative,raw`. When more than one mode runs, each mode's output goes into its own subdirectory of the output folder (e.g. `out/negative/`, `out/raw/`); a single mode writes directly into the output folder as before.

  Tuning options only affect the modes they apply to — for example `--clip` and `--output-gamma` affect `negative`, `e6`, and `bw` but are ignored by `raw` (which always writes the linear sensor data unmanipulated).

#### Tuning

* `--per-image-balancing` Compute a separate inversion profile for each image instead of sharing one across the roll.

* `--no-frame-rejection` Include all frames in the shared profile, even outliers.

* `--clip <percent>` Clip both black and white ends by N% during contrast stretch. For example, `--clip 1` gives more contrast by clipping 1% on each end.

* `--clip-black <percent>` Clip the darkest N% of pixels to black (default: 0.001).

* `--clip-white <percent>` Clip the brightest N% of pixels to white (default: 0.001).

* `--output-gamma <value>` Output gamma applied during negative inversion (default: 2.15).

* `--no-stretch` Disable contrast stretch during inversion (enabled by default).

* `--border-exclude <percent>` Exclude outer N% of image from profiling and contrast stretch (default: 2).

* `--pixel-rejection-percentage <percent>` Ignore brightest/darkest N% of pixels when profiling (default: 0.1).

#### Color space

Advanced color management. PPRC sets the RGB primaries (gamut) at three stages of the pipeline. The defaults are Adobe RGB for input and output, with a wide ACEScg working space in between: the inversion works per channel, and a wide working gamut keeps the channels further apart, which reduces hue shifts. Valid values for each: `srgb`, `adobergb`, `rec2020`, `prophoto`, `acescg`. These apply to `negative` mode only; `e6`, `bw`, and `raw` modes do no colour conversion and ignore them (PPRC warns if you set one anyway). Most users never need to change them.

* `--colorspace-input <space>` RGB primaries PPRC assumes the incoming scan data is in (default: `adobergb`).

* `--colorspace-working <space>` RGB primaries used internally while inverting and balancing (default: `acescg`).

* `--colorspace-output <space>` RGB primaries the output TIFFs are written in (default: `adobergb`).

#### Utility

* `--save-config [name]` Save current options to `~/.pprc/configs/default.json` (or `<name>.json`) and exit. For example: `pprc --clip 2.5 --save-config`.

* `--use-config <name>` Load a named config from `~/.pprc/configs/<name>.json` instead of the default. For example: `pprc --use-config bw`.

* `--save-profile <name>` Analyze input files, save the inversion profile, then exit. See [Profiles](#profiles).

* `--profile <name>` Use a previously saved inversion profile. See [Profiles](#profiles).

* `--install-quick-action` / `--uninstall-quick-action` Install or remove the macOS Finder Quick Action.

* `--examples` Show usage examples.

----------

## Global Config

You can save default settings in `~/.pprc/configs/default.json` so they apply to every run without needing CLI flags. CLI flags always take priority over config values.

The easiest way to create a config is with `--save-config`:

```
pprc --clip 2.5 --dir-out ../INPUT_DIR_inverted --save-config
```

You can also save named configs for different workflows and switch between them:

```
pprc --mode bw --clip 1.0 --save-config bw
pprc --use-config bw
```

You can also manually create or edit `~/.pprc/configs/default.json`:

```json
{
  "dirOut": "../INPUT_DIR_inverted",
  "clip": 2.5
}
```

After each run, pprc saves the effective settings to `~/.pprc/last_run_config.json`. If you liked the results, you can copy it to use as your config:

```
cp ~/.pprc/last_run_config.json ~/.pprc/configs/default.json
```

When settings are loaded from config, pprc displays them at startup so you always know what's being applied.

----------

## Profiles

A profile saves the *color analysis* PPRC computes from a batch: the shared inversion baseline (orange-mask removal and color balance). This is different from a [config](#global-config), which saves *settings* like clipping, gamma, and output directory. A config controls how PPRC processes; a profile captures the color analysis itself. A config can also reference a profile (via the `profile` setting), so a saved profile is applied automatically on every run.

Profiles apply to C-41 negative inversion and are ignored in `raw` mode.

Analyze a representative roll and save its profile with `--save-profile <name>`. This analyzes the scans, writes the profile, and exits without processing images:

```
pprc --dir /path/to/portra-roll --save-profile portra400
```

Profiles are stored in `~/.pprc/profiles/<name>.json` (`%USERPROFILE%\.pprc\profiles\<name>.json` on Windows).

Apply a saved profile to any batch with `--profile <name>`. PPRC skips its own analysis and uses the saved baseline instead:

```
pprc --dir /path/to/another-roll --profile portra400
```

This gives consistent color across multiple rolls of the same film stock, and can rescue a batch that is hard to analyze on its own (a handful of frames, or a roll where most shots are backlit or unusual). You can also set `profile` in a config file to always apply it.

After each negative run, PPRC saves the profile it used to `~/.pprc/profiles/last_run.json`. If you liked a result and want to reuse its exact analysis, copy it to a named profile:

```
cp ~/.pprc/profiles/last_run.json ~/.pprc/profiles/my-favorite.json
pprc --dir /path/to/next-roll --profile my-favorite
```

----------

## Licence

PPRC is released under the [PolyForm Noncommercial License 1.0.0](LICENSE). You can
read, run, modify, and share the source for any noncommercial purpose.

That makes PPRC source available. It is not open source in the OSI sense, because
commercial use is not permitted. If you want to use PPRC commercially, including as
part of a paid scanning or lab service, email ali@alibosworth.com about a separate
licence.

Releases up to 0.0.13 were published under GPL-3.0 and remain available under those
terms.

### The inversion engine

The negative inversion and orange mask removal happen in a separate component called
ATLAS, which installs as a prebuilt binary from the `@alibosworth/atlas-node` package.
Its source is not in this repository and it is licensed separately. Everything else is
here: the CLI, raw file detection and deplanarising, the TIFF writer, the worker
pipeline, config and profile handling.

## Contributing

Issues and suggestions are welcome. Please open an issue before sending code, for
licensing reasons explained in [CONTRIBUTING.md](CONTRIBUTING.md). For anything
security related, see [SECURITY.md](SECURITY.md).

----------

## Questions?

ali@alibosworth.com

## Feeling appreciative?

[https://ko-fi.com/alibosworth](https://ko-fi.com/alibosworth)
