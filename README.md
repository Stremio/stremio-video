# stremio-video

Abstraction layer on top of different media players

## ASS subtitles

Shells advertising `nativeAssSubtitles` load external ASS with
`sub-add <url> auto <title> <language>`. Video selects `sid` only after the current
request appears in `track-list`; timed-out or replaced requests are removed.
Shells must process subtitle commands asynchronously and cancel them on media
changes. The glutin and shell-ng implementations use the same protocol.

mpv handles embedded and installed fonts. Tracks with `fonts` or `availableFonts`
assets stay in WebView libass so their supplied fonts are preserved. ASS sources
use the streaming-server proxy without conversion to WebVTT.

Embedded ASS in HLS uses the server's `source/subtitle/:id.ass` and
`source/attachment/:id` endpoints. Probe metadata identifies ASS/SSA tracks and
font attachments. The normal HLS WebVTT rendition remains the fallback if the raw
source or renderer fails. This uses the published libass 4.2.6 API.
