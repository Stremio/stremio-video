var matroska = require('./embeddedASSMatroska');

var MAX_RANGE_BYTES = 8 * 1024 * 1024;
var MAX_READ_BYTES = 32 * 1024 * 1024;
var MAX_REQUESTS = 500;
var TIMEOUT_MS = 60000;

async function readRangeBody(response, expectedLength) {
    var reader = response.body && response.body.getReader();
    if (!reader) throw new Error('Bounded media reads are unavailable');

    var bytes = new Uint8Array(expectedLength);
    var offset = 0;
    try {
        while (true) {
            var chunk = await reader.read();
            if (chunk.done) break;
            if (offset + chunk.value.byteLength > bytes.byteLength) {
                throw new Error('Oversized media range');
            }
            bytes.set(chunk.value, offset);
            offset += chunk.value.byteLength;
        }
    } catch (error) {
        await reader.cancel().catch(function() {});
        throw error;
    } finally {
        reader.releaseLock();
    }
    if (offset !== bytes.byteLength) throw new Error('Truncated media range');
    return bytes;
}

async function discoverEmbeddedASS(mediaURL, options) {
    var parsedURL = new URL(mediaURL);
    if (!['http:', 'https:'].includes(parsedURL.protocol) || parsedURL.username || parsedURL.password) {
        return [];
    }

    var discoverySignal = options && options.signal;
    var initialRange = null;
    var mediaSize = null;
    var cues = null;
    var indexedTracks = null;

    // Each operation has its own request budget and cancellation. The first
    // validated range can seed later readers for the same playback session.
    async function readMedia(operationSignal, read) {
        var controller = new AbortController();
        var signals = [discoverySignal, operationSignal].filter(Boolean);
        var abort = function() { controller.abort(); };
        signals.forEach(function(signal) { signal.addEventListener('abort', abort); });
        var timedOut = false;
        var deadline = setTimeout(function() {
            timedOut = true;
            abort();
        }, TIMEOUT_MS);
        var bytesRead = 0;
        var requests = 0;
        try {
            if (signals.some(function(signal) { return signal.aborted; })) {
                throw new Error('Embedded ASS extraction cancelled');
            }
            var reader = new matroska.RangeReader(mediaURL, {
                fetch: async function(input, init) {
                    if (controller.signal.aborted) throw new Error('Embedded ASS extraction cancelled');
                    var range = new Headers(init.headers).get('Range');
                    var match = /^bytes=(\d+)-(\d+)$/.exec(range);
                    var start = match && Number(match[1]);
                    var end = match && Number(match[2]);
                    var length = end - start + 1;
                    if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
                        length < 1 || length > MAX_RANGE_BYTES) {
                        throw new Error('Invalid embedded ASS byte range');
                    }
                    var cachedEnd = Math.min(end, mediaSize - 1);
                    if (initialRange && cachedEnd >= start && cachedEnd < initialRange.byteLength) {
                        return new Response(initialRange.subarray(start, cachedEnd + 1), {
                            status: 206,
                            headers: { 'Content-Range': 'bytes ' + start + '-' + cachedEnd + '/' + mediaSize }
                        });
                    }
                    if (bytesRead + length > MAX_READ_BYTES) throw new Error('Embedded ASS range budget exceeded (32 MiB of media data)');
                    var bytes;
                    var next = start;
                    var headers = new Headers(init.headers);
                    while (next <= end) {
                        if (++requests > MAX_REQUESTS) throw new Error('Embedded ASS range budget exceeded (500 HTTP requests)');
                        headers.set('Range', 'bytes=' + next + '-' + end);
                        var response = await fetch(input, Object.assign({}, init, {
                            headers: headers,
                            credentials: 'omit',
                            signal: controller.signal
                        }));
                        var contentRange = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range'));
                        var last = contentRange && Number(contentRange[2]);
                        var size = contentRange && Number(contentRange[3]);
                        if (response.status !== 206 || !contentRange || Number(contentRange[1]) !== next ||
                            !Number.isSafeInteger(size) || last < next || last > Math.min(end, size - 1) ||
                            (mediaSize !== null && mediaSize !== size)) {
                            if (response.body) await response.body.cancel().catch(function() {});
                            throw new Error('Expected a valid partial media response (HTTP ' + response.status +
                                (contentRange ? ', unexpected Content-Range)' : ', unavailable Content-Range)'));
                        }
                        mediaSize = size;
                        end = Math.min(end, size - 1);
                        if (!bytes) bytes = new Uint8Array(end - start + 1);
                        var received = await readRangeBody(response, last - next + 1);
                        bytes.set(received, next - start);
                        bytesRead += received.byteLength;
                        next = last + 1;
                    }
                    if (start === 0 && !initialRange) initialRange = bytes;
                    return new Response(bytes, {
                        status: 206,
                        headers: { 'Content-Range': 'bytes ' + start + '-' + end + '/' + mediaSize }
                    });
                }
            });
            await reader.init();
            return await read(reader);
        } catch (error) {
            if (timedOut) throw new Error('Timed out while reading embedded ASS ranges');
            throw error;
        } finally {
            clearTimeout(deadline);
            signals.forEach(function(signal) { signal.removeEventListener('abort', abort); });
        }
    }

    var segment;
    var cueEntry;
    var tracks = await readMedia(null, async function(reader) {
        segment = await matroska.parseSegment(reader);
        var tracksEntry = segment.seekEntries.find(function(entry) { return entry.id === matroska.TRACKS; });
        cueEntry = segment.seekEntries.find(function(entry) { return entry.id === matroska.CUES; });
        if (!tracksEntry || !cueEntry) return [];
        return matroska.parseTracks(reader, segment.segmentDataOffset, tracksEntry.position);
    });

    return tracks.filter(function(track) {
        return ['S_TEXT/ASS', 'S_TEXT/SSA'].includes(track.codecId);
    }).map(function(track) {
        return {
            trackId: 'EMBEDDED_ASS_' + track.trackNumber,
            codec: track.codecId === 'S_TEXT/SSA' ? 'ssa' : 'ass',
            lang: track.language || null,
            label: track.trackName || null,
            fonts: [],
            url: mediaURL,
            windowed: true,
            loadWindow: function(from, to, signal) {
                return readMedia(signal, async function(reader) {
                    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to - from > 120000) {
                        throw new Error('Invalid embedded ASS time window');
                    }
                    var timestampScale = segment.info.timestampScale;
                    var cueMs = timestampScale / 1000000;
                    var lookback = Math.max(0, from - 15000);
                    if (!cues) {
                        cues = await matroska.parseCues(reader, segment.segmentDataOffset, cueEntry.position);
                        indexedTracks = new Set(cues.map(function(cue) { return cue.track; }));
                    }
                    var trackNumbers = new Set([track.trackNumber]);
                    var blocks = [];
                    if (indexedTracks.has(track.trackNumber)) {
                        var subtitleCues = cues.filter(function(cue) {
                            if (cue.track !== track.trackNumber || cue.time * cueMs >= to) return false;
                            return cue.duration === undefined ? cue.time * cueMs >= lookback :
                                (cue.time + cue.duration) * cueMs >= from;
                        });
                        if (subtitleCues.length) {
                            blocks = await matroska.readTargetedBlocks(reader, segment.segmentDataOffset, subtitleCues,
                                trackNumbers, timestampScale, 1);
                        }
                    } else {
                        // Some muxers index video clusters only. Limit the scan to the requested time window.
                        var windowCues = cues.filter(function(cue) {
                            var time = cue.time * cueMs;
                            return time >= lookback && time < to;
                        });
                        var positions = Array.from(new Set(windowCues.map(function(cue) { return cue.clusterPosition; })));
                        for (var position of positions) {
                            var next = cues.reduce(function(end, cue) {
                                return cue.clusterPosition > position ? Math.min(end, cue.clusterPosition) : end;
                            }, segment.segmentDataSize);
                            blocks.push(...await matroska.scanClusters(reader, segment.segmentDataOffset + position,
                                segment.segmentDataOffset + next, trackNumbers, timestampScale));
                        }
                    }
                    var selectedBlocks = blocks.filter(function(block) {
                        return block.trackNumber === track.trackNumber && block.timestampMs < to &&
                            block.timestampMs + (block.durationMs || 0) >= from;
                    });
                    return new TextDecoder().decode(matroska.assembleSubtitle(track, selectedBlocks));
                });
            }
        };
    });
}

module.exports = discoverEmbeddedASS;
