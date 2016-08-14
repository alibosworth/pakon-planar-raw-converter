# Pakon Planar Raw Converter

This is a small script to automate the process of converting the 16-bit Planar Raw files produced by TLXClientDemo into useful images.  Behind the scenes [ImageMagick](http://www.imagemagick.org/) is used to convert the planar file to a 16-bit TIFF and [Negfix8](https://sites.google.com/site/negfix/) is optionally used to invert/balance the negative scan.  

The result of this is "normal" looking files that contain all the data the Pakon is able to save, or optionally just dark/orange negative "linear scan" TIFF files that you can then process via tools like [Vuescan](http://www.hamrick.com/), [ColorPerfect](http://www.c-f-systems.com/Plug-ins.html).

The benefit of using this workflow is that you get the full 16-bits worth of image data rather than only the 8-bit files exported by PSI.

---------------------

## FAQ

### The non-raw files created by PSI or TLXClientDemo are amazing, why would I want to use this?

A lot of people do like these balanced images, and there are certainly some robust Kodak algorithms being used to get good images regardless of what kind of negative is being scanned, however I personally find these images overly processed and prefer a more neutral starting point with more data. My reference point is 10 years of scanning with a Minolta 5400 dedicated film scanner using [Vuescan](https://www.hamrick.com/), generally following the ["Advanced Workflow Suggestions"](https://www.hamrick.com/vuescan/html/vuesc16.htm).  My goal during scanning is to capture and save as much data as possible from which to work with. 

### The "Normal" PSI program already exports Raw files for me, why would I want to use this?

While internally the Pakon 135 is dealing with 16-bits (or perhaps actually only truly 14-bits) of image data, PSI can only export 8-bit files, even when exporting Raw TIFFs.  In my experience this limitation appears most often as artifacting/quantization in the highlights of the processed file.  When PSI is using its inversion/scene balancing algorithms it is working on the full 16-bits of data so these issues don't appear in the non-raw 8-bit exports, however as stated above I find the highlight clipping and generally heavy-handed processing a problem.

### I can just convert the Planar Raw files produced by TLXClientDemo with Photoshop, why would I want to use this?

Yes, you can use Photoshop's Raw file handling (absolutely nothing to do with "Adobe Camera Raw") to open/convert a Planar Raw file, but you'll have to specify the image details (dimensions, channel count, bit-depth, header offset) each time, and then save out to a TIFF.  This script scans a whole directory of images and uses the files size to automatically know what resolution you've scanned at, and uses the ImageMagick library to convert to a standard TIFF, and then if you want also inverts it into a "positive" image using Negfix8.

----------------------------------

## Installing

The gist is you need to install Node, ImageMagick, and Negfix8 on your system, and then install this script "globally".  Technically all of the above should be possible on any Operating System, but here's the easiest way to do it if you are on OSX.

#### Short version:

`brew install imagemagick negfix8`

`npm install -g alibosworth/pakon-planar-raw-converter`

#### Long version:

1) Install ["Node"](https://nodejs.org/en/download/).  Node is a thing which runs Javascript outside of your browser. That's because even though this script and your scans and your Pakon have nothing to do with the WorldWideWeb, I've used Javascript to write this script.  Don't worry, nothing is being sent to the Internet.  
2) Install ["Homebrew"](http://brew.sh/). Homebrew is a handy tool for installing programs on your computer quickly.  Installing it will let you install other things.  
3) Open your computer's terminal by presing cmd-space and typing "terminal" and hitting enter.  You might already have this open if you followed Homebrew's installation instructions.  
4) In your terminal type `brew install imagemagick negfix8`, this will install ImageMagick and Negfix8.  If you want to you can skip steps 2, 3, and 4 and just install these dependancies manually.   
5) Install this script globally via `npm install -g alibosworth/pakon-planar-raw-converter`

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
* "Orginal Height and Width"
* "Other Options": uncheck everything except "Use Scratch Removal" if you enabled that earlier
* "Type of Save Operation" : "To Client Memory"
* "Planar" (this is important!) either with or without "Add File Header"
* Click "OK"

7) Once this process completes you will now have a `C:\Temp` full of 16-bit Planar Raw files ready to be processed, if you are using a VM to run Windows XP you would then copy those files to a directory on your host machine for further processing.

---------------



## Using this script

#### Short version: 

Simply run `pprc` from the directory containg your raw images.

#### Long version:

You must run this program from your computers "terminal", that means that it is text-based rather than mouse-based, but it should be really easy even if you have never done that kind of thing before.  Once you've installed it, all you have to do is:

1) Open your computer's terminal by presing cmd-space and typing "terminal" and hitting enter (assuming OSX).

2) Travel to the directory where your TLXClientDemo created Raw files are, the easiest way to do this is to type `cd `  in the terminal (that is "cd" for Change Directory, followed by a space), and then drag the folder that contains your images into the terminal window.  When you do this it knows to insert the path (location) of the directory you dropped, so it might look like `cd /Users/alibosworth/Photos/scans/roll5`.  If it looks like that press the enter key, and you will now be "in" the directory containing your images. 

3) type `pprc` and the enter key.

----------------

## Options

By default when you run the command `pprc` in the directory containing your TLXClientDemo exported raw files the following things will happen:

1) The planar .raw files will be converted to "raw" TIFF files and put in a "raw_tiff" sub-directory.

3) The original raw files are placed in a "planar_raw" subdirectory.

2) Negfix8 is run on these tiff files and these files are placed in the current directory.

Here are some options you can run:

* `—no-negfix` don't run negfix8.  This will leave you with TIFFs that look dark and orange but you can use other tools to process them them such as [Vuescan](http://www.hamrick.com/) or [ColorPerfect](http://www.c-f-systems.com/Plug-ins.html),
* `—negfix-use-whole-set-for-calculations` by default negfix8 is run upon each image individually, allowing it to do its calculations on an image-by-image basis which generally leads to the best output for most situations.  If all of your scans in the current directory were exposed in similar conditions you might want to balancing to be applied equally to every image.  An extreme example of this would be if you had taken 10 pictures of a person standing in front of a grey wall, wearing a different brightly coloured shirt in each picture.  When Negfix8 is processing each image individually, you are likely to end up with a slightly different color-cast upon the grey wall as it attempts to compensate for the bright color of the shirt.  With this option enabled the wall would end up with exactly the same color-cast.
* `—delete-planar-files` Delete the planar raw files once processed.
* `—delete-all-raw-files` Delete both the Planar raw files and the raw tiff files once processed. Can not be combined with the `—no-negfix` option.  This is not at all recommended, I 
