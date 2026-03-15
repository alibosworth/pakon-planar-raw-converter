# Pakon Planar Raw Converter (PPRC)

This is a tool to automate the process of converting the 16-bit Planar Raw files produced by TLXClientDemo into useful images (inverted and with negative orange mask removed).  The raw planar data is converted directly to a 16-bit TIFF and [negpro](https://github.com/alibosworth/negpro) is optionally used to invert/balance the negative scan (before version 1.0.0 Negfix8 was used to invert the images).

The result of this is "normal" looking files that contain all the data that the Pakon 135+ is able to save, or optionally just dark/orange negative "linear scan" TIFF files that you can then process via tools like [Vuescan](http://www.hamrick.com/) or [ColorPerfect](http://www.c-f-systems.com/Plug-ins.html).  Additionally the "--e6", "--bw", or "--bw-rgb" options may be used to perform auto-leveling and inversion on the TIFF file instead of negpro.  You may need to use the [TLX_ScanEnable](https://github.com/sgharvey/pakon-tlx-addons) AutoIt script to enable B&W and Positive scanning modes that make these options useful.

The benefit of using this workflow is that you get the full 16-bits worth of image data rather than only the 8-bit files exported by PSI.  [Here are some comparisons](https://alibosworth.github.io/pakon-planar-raw-converter/comparison/) of standard PSI output vs TLXCD raw output.

Technically, PSI itself can also export raw files, but they suffer from being only 8-bit which leads to occasional image quality issues [such as these](https://alibosworth.github.io/pakon-planar-raw-converter/8bit_raw_highlight_issue/).

When scanning via TLX you can scan in any resolution ("base").  When saving ensure that none of the checkboxes in the "other options" section of the save dialog are checked except for "use scratch removal" if you have scanned with scratch removal enabled.

---------------------

## FAQ

### Im not comfortable with using the command line, is it hard?

Once you get it installed it is only a single command to run within a directory of .raw files.  On macOS you can install a finder quick action to get a right-click "Process with PPRC" option.

### The non-raw files created by PSI or TLXClientDemo are amazing, why would I want to use this?

A lot of people do like the default output images, and there are certainly some robust Kodak algorithms being used to often produce passable images regardless of what kind of negative is being scanned, however I personally find these images overly processed and prefer a more neutral starting point with more data. My reference point is 10 years of scanning with a Minolta 5400 dedicated film scanner using [Vuescan](https://www.hamrick.com/), generally following the ["Advanced Workflow Suggestions"](https://www.hamrick.com/vuescan/html/vuesc16.htm).  My goal during scanning is always to capture and save as much data as possible from which to work with later.

### The "Normal" PSI program already exports Raw files for me, why would I want to use TLXClientDemo's planar raw output?

While internally the Pakon 135+ is dealing with 16-bits of image data, PSI can only export 8-bit files, even when exporting raw TIFFs.  In my experience this limitation appears most often as artifacting/quantization in the highlights of the processed file - [here are some examples of the issue](https://alibosworth.github.io/pakon-planar-raw-converter/8bit_raw_highlight_issue/).  When PSI is using its inversion/balancing algorithms it is working on the full 16-bits of data so these issues don't appear in the non-raw exports, however as stated above I find the highlight clipping and generally heavy-handed processing limiting (and you still only end up 8-bits of data).

### I can just convert the planar raw files produced by TLXClientDemo with Photoshop, why would I want to use this script?

Yes, you can use Photoshop's raw file handling to open/convert a planar raw file, but you'll have to specify the image details (dimensions, channel count, bit-depth, header offset) each time, and then save out to a TIFF.  This script processes a whole directory of images and detects the dimensions, then converts to a standard 16-bit TIFF (and then if you want also inverts it into a "positive" image using [negpro](https://github.com/alibosworth/negpro)).

## How does the color inversion work?

This is all done using [negpro](https://github.com/alibosworth/negpro). By default all images are analyzed and averaged so that the same calculations are used across your roll to remove the orange mask. In general this leads to more consistent and accurate images. There are a lot of options "under the hood" of negpro and you can save your preferences in a global config so they are automatically used. *Further documentation about this forthcoming*.

----------------------------------

## Installing

You need to have Node on your system, and then install this script "globally" so you can run it from any directory.

1) Install Node.js via "prebuilt" installer from [here](https://nodejs.org/en/download) (Node is a JavaScript runtime environment to run JavaScript outside your browser). This is needed because even though this script and your scans and your Pakon have nothing to do with the internet, PPRC is written in JavaScript.

2) **[Mac]** Open your computer's terminal prompt by pressing CMD-space and typing "terminal" then "return".
   
   **[Windows]** Open your "command prompt" by clicking the start button and searching for "cmd" and running it.

4) Install PPRC globally by pasting in `npm install -g pakon-planar-raw-converter --foreground-scripts` and hitting return/enter.

#### macOS Finder Quick Action

After installing on a mac you can run `pprc --install-quick-action` to install a finder "Quick Action" so you can right-click a folder and "Process with PPRC"

#### Windows XP Note

Please do not try to run PPRC on Windows XP.  Everything will be easier and faster if you install this on a more modern operating system. There is no need to run PPRC from the computer you scanned on.

------------------

## Updating

You can check your currently installed version with "pprc --version" and  update with `npm update -g pakon-planar-raw-converter --foreground-scripts`

------------------

## Scanning

Here's a quick summary of scanning with TLXClientDemo:

1) Run TLXClientDemo

2) Click "Scan"

3) Choose your scanning options and scan your negatives:

* Select "Film Color" :  "Negative"
* Choose any Resolution
* Choose the appropriate "Frames Per Strip" option
* Optionally enable "Scratch Removal"
* Click "Scan", let scan complete.

4) Click "Move Oldest Roll in Scan Group To Save Group"

5) You may now review your scans using "Previous" and "Next" and optionally correct framing (but not cropping!). Do not rotate any images.

6) Click "Save" and set the save options:

* "All Pictures (except hidden)"
* "Original Height and Width"
* "Other Options": **uncheck everything** except "Use Scratch Removal" if you enabled that earlier
* "Type of Save Operation" : "To Client Memory"
* "Planar" (this is important!) with "Add File Header" enabled (recommended — allows automatic dimension detection, even with custom sizing)
* Click "OK"

7) Once this process completes you will now have a `C:\Temp` full of 16-bit Planar Raw files ready to be processed, if you are using a VM to run Windows XP you would then copy those files to a directory on your host machine for further processing.

---------------

## Using this script

#### Short version:

Simply run `pprc` from the directory containing your raw images.

#### Long version:

You must run this program from your computer's "terminal" or "command prompt", that means that it is text-based rather than mouse-based, but it should be easy even if you have never done that kind of thing before.  Once you've installed it, all you have to do is:

1) Open your computer's terminal by pressing CMD-space and typing "terminal" and hitting enter (on macOS) or using the Start Menu to find "cmd.exe" (on Windows).

2) Travel to the directory where your TLXClientDemo created raw files are, the easiest way to do this is to type `cd `  in the terminal (that is "cd" for Change Directory, followed by a space), and then drag the folder that contains your images into the terminal/command window from Finder/Explorer.  When you do this it knows to insert the location of the dropped directory, so it might look like `cd /Users/alibosworth/Photos/scans/roll5`.  If it looks like that press the enter key, and you will now be "in" the directory containing your images.

3) type `pprc` and the enter key.  After a few moments you should have an "out" directory containing the processed images.

## Options

By default when you run the command `pprc` in the directory containing your TLXClientDemo exported raw files the following things will happen:

1) The planar .raw files will be converted to temporary TIFF files.

2) [negpro](https://github.com/alibosworth/negpro) is run on these TIFF files to invert and balance the negatives, and the results are placed in the "out" directory. The temporary TIFF files are then deleted.

Here are some options you can run:

* `--no-invert` Don't run negpro.  This will leave you with TIFFs that look dark and orange but you can use other tools to process them such as [Vuescan](http://www.hamrick.com/) or [ColorPerfect](http://www.c-f-systems.com/Plug-ins.html).  If you use this option the raw TIFF files will be placed in the output directory.

* `--keep-tiffs` Keep the intermediate TIFF files in a "tiffs" subdirectory instead of deleting them after inversion.

* `--per-image-balancing` Compute a separate inversion profile for each image instead of sharing one across all files. By default, all images are analysed together to produce a shared profile for more consistent results across a roll.

* `--clip-black <percent>` Clip the darkest N% of pixels to black during contrast stretch (negpro default: 0.1).

* `--clip-white <percent>` Clip the brightest N% of pixels to white during contrast stretch (negpro default: 0.1).

* `--clip <percent>` Shorthand to set both `--clip-black` and `--clip-white` to the same value. For example, `--clip 1` gives more contrast by clipping 1% on each end.

* `--output-dir [dir]`  Specify a different output subdirectory rather than "out".

* `--e6` Skip running negpro, apply auto-level on files.  Useful when scanning "Film Color: Positive" in TLXClientDemo.

* `--bw` Skip running negpro, instead: invert, auto-level, and save as grey-scale colorspace.

* `--bw-rgb` Skip running negpro, instead: invert, auto-level, and save in RGB colorspace.

* `--gamma1` Do not apply a 2.2 gamma correction when converting the raw file, instead leaving it "linear", with a 1.0 gamma.

* `--dimensions [width]x[height]` Manually specify pixel dimensions for headerless raw files (e.g. "--dimensions 4000x2000"). Not needed when "Add File Header" is enabled in TLXClientDemo as dimensions are read from the header automatically. Also not needed if your headerless files did not use custom sizing (eg you aren't doing half-frame or XPan scans). Deprecated: save files with "Add File Header" selected.

* `--no-negfix` Deprecated alias for `--no-invert`.

----------

## Questions? 

ali@alibosworth.com

## Feeling appreciative?

[https://ko-fi.com/alibosworth](https://ko-fi.com/alibosworth)
