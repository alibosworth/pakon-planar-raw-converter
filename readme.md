# Pakon Planar Raw Converter (PPRC)

This is a small script to automate the process of converting the 16-bit Planar Raw files produced by TLXClientDemo into useful images.  Behind the scenes [ImageMagick](http://www.imagemagick.org/) is used to convert the planar file to a 16-bit TIFF and [Negfix8](https://sites.google.com/site/negfix/) is optionally used to invert/balance the negative scan.  

The result of this is "normal" looking files that contain all the data that the Pakon 135+ is able to save, or optionally just dark/orange negative "linear scan" TIFF files that you can then process via tools like [Vuescan](http://www.hamrick.com/) or [ColorPerfect](http://www.c-f-systems.com/Plug-ins.html).

The benefit of using this workflow is that you get the full 16-bits worth of image data rather than only the 8-bit files exported by PSI.  [Here are some comparisons](https://alibosworth.github.io/pakon-planar-raw-converter/comparison/) of standard PSI output vs TLXCD raw output. 

Technically, PSI itself can also export raw files, but they suffer from being only 8-bit which leads to occasional image quality issues [such as these](https://alibosworth.github.io/pakon-planar-raw-converter/8bit_raw_highlight_issue/).

---------------------

## FAQ

### The non-raw files created by PSI or TLXClientDemo are amazing, why would I want to use this?

A lot of people do like the default output images, and there are certainly some robust Kodak algorithms being used to often produce passable images regardless of what kind of negative is being scanned, however I personally find these images overly processed and prefer a more neutral starting point with more data. My reference point is 10 years of scanning with a Minolta 5400 dedicated film scanner using [Vuescan](https://www.hamrick.com/), generally following the ["Advanced Workflow Suggestions"](https://www.hamrick.com/vuescan/html/vuesc16.htm).  My goal during scanning is always to capture and save as much data as possible from which to work with later.

### The "Normal" PSI program already exports Raw files for me, why would I want to use TLXClientDemo's planar raw output?

While internally the Pakon 135+ is dealing with 16-bits of image data, PSI can only export 8-bit files, even when exporting raw TIFFs.  In my experience this limitation appears most often as artifacting/quantization in the highlights of the processed file - [here are some examples of the issue](https://alibosworth.github.io/pakon-planar-raw-converter/8bit_raw_highlight_issue/).  When PSI is using its inversion/balancing algorithms it is working on the full 16-bits of data so these issues don't appear in the non-raw exports, however as stated above I find the highlight clipping and generally heavy-handed processing limiting (and you still only end up 8-bits of data).

### I can just convert the planar raw files produced by TLXClientDemo with Photoshop, why would I want to use this script?

Yes, you can use Photoshop's raw file handling to open/convert a planar raw file, but you'll have to specify the image details (dimensions, channel count, bit-depth, header offset) each time, and then save out to a TIFF.  This script scans a whole directory of images using the file sizes to automatically know what resolution you've scanned at, then uses the ImageMagick library to convert to a standard TIFF (and then if you want also inverts it into a "positive" image using Negfix8).

----------------------------------

## Installing

You need to have Node, ImageMagick, and Negfix8 on your system, and then install this script "globally" so you can run it from any directory.  Technically all of the above should be possible on any kind of computer, but here's the easiest way to do it if you are on OSX.

### OSX

#### Short version (if you have [homebrew](http://brew.sh/) installed):

* `brew install imagemagick negfix8 node npm`
* `npm install -g pakon-planar-raw-converter`

#### Long version:

1) Install ["Homebrew"](http://brew.sh/). Homebrew helps install other things on your computer.

2) Open your computer's terminal by pressing CMD-space and typing "terminal" and hitting enter (you might already have this open if you followed Homebrew's installation instructions).

3) Install Node, which runs Javascript outside of your browser. This is needed because even though this script and your scans and your Pakon have nothing to do with the internet, this program is written in Javascript. The easiest way to install it is to type `brew install node npm` in your terminal.  You can also [download an installer](https://nodejs.org/en/) however you may run into [permission issues](https://docs.npmjs.com/getting-started/fixing-npm-permissions) when trying to globally install the script later.

4) Install ImageMagick and Negfix8 by typing `brew install imagemagick negfix8` in your terminal. You may also install these dependancies manually.

5) Install PPRC globally via `npm install -g pakon-planar-raw-converter`

### Windows

1) Install Node via [downloadable installer](https://nodejs.org/en/)

2) Install Imagemagick via [downloadable installer](http://www.imagemagick.org/script/binary-releases.php#windows) (make sure to check off "install legacy utilities" as negfix8 needs this)

3) Install Git via [downloadable installer](https://git-scm.com/download/win)

4) Download the Windows version of the [Negfix8 script](https://sites.google.com/site/negfix/downloads), and place it in C:\Windows\System32 (or elsewhere if you know how to make it globally available by updating your PATH)

5) Open the command prompt by clicking the start button and searching for "cmd" and running it

6) run `npm install -g pakon-planar-raw-converter`

------------------

## Updating

You can check your currently installed version with "pprc --version" and if needed update with `npm update -g pakon-planar-raw-converter`

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
* "Other Options": uncheck everything except "Use Scratch Removal" if you enabled that earlier
* "Type of Save Operation" : "To Client Memory"
* "Planar" (this is important!) either with or without "Add File Header"
* Click "OK"

7) Once this process completes you will now have a `C:\Temp` full of 16-bit Planar Raw files ready to be processed, if you are using a VM to run Windows XP you would then copy those files to a directory on your host machine for further processing.

---------------

## Using this script

#### Short version: 

Simply run `pprc` from the directory containing your raw images.

#### Long version:

You must run this program from your computer's "terminal", that means that it is text-based rather than mouse-based, but it should be easy even if you have never done that kind of thing before.  Once you've installed it, all you have to do is:

1) Open your computer's terminal by pressing CMD-space and typing "terminal" and hitting enter (assuming OSX).

2) Travel to the directory where your TLXClientDemo created raw files are, the easiest way to do this is to type `cd `  in the terminal (that is "cd" for Change Directory, followed by a space), and then drag the folder that contains your images into the terminal window from Finder.  When you do this it knows to insert the location of the dropped directory, so it might look like `cd /Users/alibosworth/Photos/scans/roll5`.  If it looks like that press the enter key, and you will now be "in" the directory containing your images. 

3) type `pprc` and the enter key.  After a few moments you should have an "out" directory containing the processed images.


## Options

By default when you run the command `pprc` in the directory containing your TLXClientDemo exported raw files the following things will happen:

1) The planar .raw files will be converted to raw TIFF files left in place.

2) Negfix8 is run on these TIFF files and these files are placed in the "out" directory.

Here are some options you can run:

* `--no-negfix` Don't run negfix8.  This will leave you with TIFFs that look dark and orange but you can use other tools to process them them such as [Vuescan](http://www.hamrick.com/) or [ColorPerfect](http://www.c-f-systems.com/Plug-ins.html).  If you use this options the raw TIFF files will be placed in the output directory.

* `--output-directory [dir]`  Specify a different output subdirectory rather than "out".

* `--dimensions [width]x[height]` Specify a non-standard image size if you adjust the framing within TLXClient. 
* 
* `--output-directory [dir]`  Specify a different output subdirectory rather than "out".

* `--e6` Skip running negfix8, apply ImageMagick's -auto-level on files.  Useful when scanning "Film Color: Positive" in TLXClientDemo.

----------

## Questions?

ali@alibosworth.com
