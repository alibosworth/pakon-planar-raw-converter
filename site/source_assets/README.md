# Source Assets

Source recordings for the PPRC site hero videos.

## Original Files

- `pprc-hero-vid-light-orig.mov` — Light mode Finder recording (1418×1302, 60fps, 17s)
- `pprc-hero-vid-dark-orig.mov` — Dark mode Finder recording (1418×1302, 60fps, 22s)

## Processing

Web-ready versions are generated with a single ffmpeg pass (crop + trim):

```bash
# Light
ffmpeg -i pprc-hero-vid-light-orig.mov \
  -vf "crop=1144:1026:146:110" -ss 5.05 -t 10.37 \
  -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p \
  -movflags +faststart -an ../public/videos/pprc-hero-vid-light-web.mp4

# Dark
ffmpeg -i pprc-hero-vid-dark-orig.mov \
  -vf "crop=1144:1026:146:110" -ss 11.77 -t 10.37 \
  -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p \
  -movflags +faststart -an ../public/videos/pprc-hero-vid-dark-web.mp4
```

### Crop: `1144x1026` at `x=146, y=110`

Removes Finder window shadow, leaving just the window frame. Output is 1144×1026 (displays at 572×513 for retina sharpness).

### Trim

Both videos are trimmed to 10.37s with the click action synced at 4.24s:

| Version | Start  | End    | Click at |
|---------|--------|--------|----------|
| Light   | 5.05s  | 15.42s | 9.29s    |
| Dark    | 10.77s | 21.14s | 15.01s   |

Times are relative to the original recordings. The click occurs at 4.24s in both trimmed outputs.
