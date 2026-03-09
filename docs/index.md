---
layout: default
title: Pakon Planar Raw Converter
content_class: page
---

[Pakon Planar Raw Converter](https://github.com/alibosworth/pakon-planar-raw-converter) is a script to automate the process of converting the 16-bit planar raw files produced by TLXClientDemo into usable images.

Being able to use raw 16-bit files gives you the most control over your negative scans. [Here]({{ '/comparison/' | relative_url }}) are some comparisons of "standard" PSI output compared to TLXCD planar output converted with this script.

PSI can only save to 8-bit raw files, leading to image quality issues because of missing data. [Here]({{ '/8bit_raw_highlight_issue/' | relative_url }}) are some examples.

There is also a [dimensions calculator]({{ '/dimensions' | relative_url }}) for determining image dimensions from raw file sizes.

### Quick install

```
npm install -g pakon-planar-raw-converter
```

### Quick usage

Run `pprc` from the directory containing your `.raw` files:

```
pprc
```

Processed files will be saved to the `out/` subdirectory.

---

What follows is the full [readme](https://github.com/alibosworth/pakon-planar-raw-converter/blob/main/readme.md):

{% include_relative _readme.md %}
