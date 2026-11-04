# Tizen audio and subtitle track mapping

Samsung AVPlay can omit streams it cannot decode and renumber the remaining tracks. Its native track index is the selection identifier; a Matroska source track number is not interchangeable with that index.

The Tizen adapter retains every native audio/text track. Source metadata is matched in media order within each type. If source/native counts differ, audio metadata is filtered using the codecs actually reported by AVPlay; bitmap subtitle metadata is excluded when matching remaining text tracks. Metadata is applied only when the complete candidate list matches the native list. Ambiguous lists retain native language information instead of borrowing a different track's label.

Metadata requests use the configured `streamingServerURL`, including on Tizen 5.5, and run after native preparation. Responses from previous loads are ignored. Unload clears labels and pending selections. Metadata cannot create a native stream that AVPlay omitted.

## TV-only playback

The adapter does not introduce an external-server requirement. It uses the streaming server already configured by the client; existing callers continue to default to the TV-local loopback address. Missing metadata does not remove native tracks or prevent playback.

This patch corrects identification and selection of the tracks AVPlay exposes. It does not add an audio decoder, transcode unsupported streams, or reconstruct PGS bitmaps. Listing a source stream that the native player cannot select would not make it playable.

On the tested TV, direct playback omitted DTS and TrueHD audio in both synthetic fixtures and the original file. Restoring these formats without another device requires an additional on-device decoding/remuxing pipeline, beyond this track-metadata adapter. Default playback/transcoding policy is unchanged.

## Bitmap subtitles

PGS requires bitmap decoding/compositing or server-side burn-in/OCR. The inspected streaming-server build explicitly filters PGS out of its HLS subtitle conversions. Changing language metadata does not restore those subtitle tracks. A compatible external text subtitle or a separate server/renderer implementation is required. Do not relabel an unavailable PGS source as a native text track.

## Validation

Run `node --test test/*.test.js` and `npm run lint`.

Hardware checks used a Samsung UE43TU7105KXXC, Tizen 5.5, AVPlay 4.0. A source with nine audio streams and ten subtitle streams exposed seven AC3 audio streams and two text subtitles through direct AVPlay. The patched Tizen adapter correctly identified and selected all seven native audio tracks and matched the two text subtitle IDs to source track numbers. Synthetic SRT/ASS fixtures produced subtitle callbacks; synthetic DTS/TrueHD audio was omitted during direct playback.
