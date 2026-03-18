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
2. Analyzes the entire roll to compute a shared color profile
3. Removes the orange mask and inverts the negative
4. Outputs files ready to import into Lightroom, Capture One, Bridge, or any editor that handles 16-bit TIFFs

The result is images that preserve all the data your scanner captured: the best possible starting point for your editing.

[Here are some comparisons](https://alibosworth.github.io/pakon-planar-raw-converter/comparison/) of standard PSI output vs PPRC output. And [here are examples](https://alibosworth.github.io/pakon-planar-raw-converter/8bit_raw_highlight_issue/) of the quality issues caused by PSI's 8-bit limitation.


## What PPRC is not

PPRC is not a full-featured negative inversion editor. It does not offer per-image film base selection, manual color correction, or creative grading controls. Tools like [Negative Lab Pro](https://www.negativelabpro.com/), [Grain2Pixel](https://grain2pixel.com/), [ColorNeg](https://www.colorperfect.com/colorneg.html), or [NegPy](https://github.com/marcinz606/NegPy) are designed for that.

PPRC's output is intentionally neutral and data-rich rather than punchy or stylized. Images will look flatter than what you'd get from a more aggressive inversion tool, and this is by design. The goal is to preserve maximum editing headroom so you can make decisions yourself via your preferred workflow.

If you want to use your own orange mask removal process, run with `--no-invert` to instantly get 16-bit TIFF files to pipe through Negative Lab Pro, ColorPerfect, Vuescan, or any other tool.

## How does the color inversion work?

The inversion and orange mask removal is done by a new tool I've built called negpro (pending link). By default, all images in a batch are analyzed together to compute a shared color profile. This produces more consistent results across a roll than analyzing each frame individually.

During analysis, the very brightest and darkest pixels within each frame are ignored so that dust spots or specular highlights don't skew the profile (this is conservative but can be disabled if you want a truly "lossless" conversion). Outlier frames (e.g. backlit shots with very different color characteristics) are also automatically detected and excluded from the shared profile so they don't throw off the rest of the roll.

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

You'll need Node.js installed, then install PPRC globally:

1) Install Node.js via the installer from [nodejs.org](https://nodejs.org/en/download)

2) Open a terminal:
   - **Mac**: Press CMD-space, type "terminal", hit return
   - **Windows**: Open the Start menu, search for "cmd", run it

3) Install PPRC globally:
   ```
   npm install -g pakon-planar-raw-converter --foreground-scripts
   ```

   *note: `--foreground-scripts` is needed for PPRC to show a welcome message after install, but is not strictly necessary*

#### macOS Finder Quick Action

After installing on a Mac, run `pprc --install-quick-action` to add a Finder Quick Action. You can then right-click any folder of raw files and select "Process with PPRC".

#### Windows XP Note

Please do not try to run PPRC on Windows XP. Everything will be easier and faster if you install this on a more modern operating system. There is no need to run PPRC from the computer you scanned on.

------------------

## Updating

PPRC will attempt to detect and show you a message when there is an update available, but you can update to the latest version at any time with `npm update -g pakon-planar-raw-converter --foreground-scripts`.

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

#### Step by step:

1) Open your terminal (CMD-space → "terminal" on macOS, or Start → "cmd" on Windows).

2) Navigate to the directory containing your raw files. The easiest way is to type `cd ` (with a space) and then drag the folder into the terminal window.

3) Type `pprc` and press enter. After a few seconds you should have an `out/` directory containing the processed images.

## Options

* `--dir [dir]` Process a specific directory of .raw files instead of the current directory.

* `--dir-out [dir]` Specify the output directory (default: `out`, placed inside the input directory). Supports the `DIR_NAME` placeholder which is replaced with the input folder's name. If the output directory already exists, pprc auto-increments the name (`out`, `out_2`, `out_3`, etc.). Start with `../` to place the output beside the input folder instead of inside it. Absolute paths are used as-is (no auto-increment). Examples:

  * `pprc --dir-out DIR_NAME_inverted` — output inside input folder as e.g. `myfolder_inverted/`
  * `pprc --dir-out ../DIR_NAME_pprc_out` — output beside input folder as e.g. `myfolder_pprc_out/`
  * `pprc --dir-out /path/to/output` — output to an absolute path

* `--no-invert` Skip orange mask removal. Outputs raw 16-bit TIFFs for use with your own inversion tool (Negative Lab Pro, ColorPerfect, Vuescan, etc.).

* `--per-image-balancing` Compute a separate inversion profile for each image instead of sharing one across the roll.

* `--no-frame-rejection` Include all frames in the shared profile, even outliers.

* `--clip <percent>` Clip both black and white ends by N% during contrast stretch. For example, `--clip 1` gives more contrast by clipping 1% on each end.

* `--clip-black <percent>` Clip the darkest N% of pixels to black (default: 0.1).

* `--clip-white <percent>` Clip the brightest N% of pixels to white (default: 0.1).

* `--e6` Skip inversion, apply auto-level. For "Film Color: Positive" (slide film) scans.

* `--bw` Invert, auto-level, and save as greyscale.

* `--bw-rgb` Invert, auto-level, and save in RGB colorspace.

* `--gamma1` Skip gamma correction, leaving the raw file linear (gamma 1.0).

* `--dimensions [width]x[height]` Manually specify pixel dimensions for headerless raw files. Not needed when "Add File Header" is enabled in TLXClientDemo. Deprecated: save files with "Add File Header" selected.

* `--install-quick-action` / `--uninstall-quick-action` Install or remove the macOS Finder Quick Action.

* `--examples` Show usage examples.

----------

## Global Config

You can save default settings in `~/.pprc/config.json` so they apply to every run without needing CLI flags. CLI flags always take priority over config values.

For example, to always place output beside the input folder:

```json
{
  "dirOut": "../DIR_NAME_inverted"
}
```

After each run, pprc saves the effective settings to `~/.pprc/last_run_config.json`. If you liked the results, you can copy it to use as your config:

```
cp ~/.pprc/last_run_config.json ~/.pprc/config.json
```

When settings are loaded from config, pprc displays them at startup so you always know what's being applied.

----------

## Questions?

ali@alibosworth.com

## Feeling appreciative?

[https://ko-fi.com/alibosworth](https://ko-fi.com/alibosworth)
