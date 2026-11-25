var assert = require('node:assert/strict');
var test = require('node:test');
var createFixture = require('./matroskaFixture');
var discoverEmbeddedASS = require('../src/embeddedASSCompatibility');
var matroska = require('../src/embeddedASSMatroska');

var mediaURL = 'https://media.example.test/video.mkv';
var fixture = createFixture();

function partialResponse(range, bytes = fixture) {
    var match = /^bytes=(\d+)-(\d+)$/.exec(range);
    var start = Number(match[1]);
    var end = Math.min(Number(match[2]), bytes.length - 1);
    return new Response(bytes.subarray(start, end + 1), {
        status: 206,
        headers: { 'Content-Range': 'bytes ' + start + '-' + end + '/' + bytes.length }
    });
}

test('extracts the embedded ASS track and reuses the initial range across windows', async function(t) {
    var request = t.mock.method(globalThis, 'fetch', async function(_url, init) {
        return partialResponse(new Headers(init.headers).get('Range'));
    });

    var tracks = await discoverEmbeddedASS(mediaURL);
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].codec, 'ass');
    assert.match(await tracks[0].loadWindow(0, 3000), /Dialogue:.*0:00:01\.00,0:00:04\.00/);
    assert.match(await tracks[0].loadWindow(4000, 8000), /Second subtitle/);
    assert.equal(request.mock.callCount(), 1);
});

test('keeps an indexed silent subtitle window empty without scanning the video', async function(t) {
    var bytes = createFixture({ padding: 300000 });
    var request = t.mock.method(globalThis, 'fetch', async function(_url, init) {
        return partialResponse(new Headers(init.headers).get('Range'), bytes);
    });
    var tracks = await discoverEmbeddedASS(mediaURL);
    assert.match(await tracks[0].loadWindow(0, 8000), /^Dialogue:/m);
    var previousRequests = request.mock.callCount();
    var silentWindow = await tracks[0].loadWindow(30000, 90000);
    assert.match(silentWindow, /^\[Script Info\]/m);
    assert.doesNotMatch(silentWindow, /^Dialogue:/m);
    assert.equal(request.mock.callCount(), previousRequests);
});

test('uses the cluster scan for a track absent from the subtitle index', async function(t) {
    var bytes = createFixture({ indexSubtitles: false });
    t.mock.method(globalThis, 'fetch', async function(_url, init) {
        return partialResponse(new Headers(init.headers).get('Range'), bytes);
    });
    var tracks = await discoverEmbeddedASS(mediaURL);

    assert.match(await tracks[0].loadWindow(0, 8000), /Second subtitle/);
});

test('finds unindexed subtitles in a cluster cued before the lookback', async function(t) {
    var bytes = createFixture({ indexSubtitles: false, secondSubtitleStart: 20000 });
    t.mock.method(globalThis, 'fetch', async function(_url, init) {
        return partialResponse(new Headers(init.headers).get('Range'), bytes);
    });
    var tracks = await discoverEmbeddedASS(mediaURL);

    var subtitles = await tracks[0].loadWindow(20000, 30000);
    assert.deepEqual(subtitles.match(/^Dialogue:.*$/gm), [
        'Dialogue: 0,0:00:20.00,0:00:22.00,Default,,0,0,0,,Second subtitle'
    ]);
    assert.doesNotMatch(await tracks[0].loadWindow(23000, 30000), /^Dialogue:/m);
});

test('scans a cluster only once when a window cue points to the predecessor cluster', async function(t) {
    var bytes = createFixture({ indexSubtitles: false, secondSubtitleStart: 20000, duplicateClusterCue: true });
    t.mock.method(globalThis, 'fetch', async function(_url, init) {
        return partialResponse(new Headers(init.headers).get('Range'), bytes);
    });
    var tracks = await discoverEmbeddedASS(mediaURL);

    var subtitles = await tracks[0].loadWindow(20000, 30000);
    assert.deepEqual(subtitles.match(/^Dialogue:.*$/gm), [
        'Dialogue: 0,0:00:20.00,0:00:22.00,Default,,0,0,0,,Second subtitle'
    ]);
});

test('continues from the next byte when the origin returns only part of the requested range', async function(t) {
    var requests = [];
    t.mock.method(globalThis, 'fetch', async function(_url, init) {
        var range = new Headers(init.headers).get('Range');
        var start = Number(/^bytes=(\d+)-/.exec(range)[1]);
        requests.push(start);
        var end = Math.min(start + 2047, fixture.length - 1);
        return new Response(fixture.subarray(start, end + 1), {
            status: 206,
            headers: { 'Content-Range': 'bytes ' + start + '-' + end + '/' + fixture.length }
        });
    });
    var tracks = await discoverEmbeddedASS(mediaURL);
    assert.equal(tracks.length, 1);
    assert.match(await tracks[0].loadWindow(0, 8000), /Second subtitle/);
    assert.deepEqual(requests, [0, 2048, 4096, 6144]);
});

test('keeps widely spaced subtitle cues from triggering a large video read', async function() {
    var clusterHeader = Uint8Array.of(0x1f, 0x43, 0xb6, 0x75, 0x80);
    var simpleBlock = Uint8Array.of(0xa3, 0x85, 0x83, 0, 0, 0x80, 0x41);
    var cues = Array.from({ length: 20 }, function(_, index) {
        return { time: index * 1000, track: 3, clusterPosition: index * 512 * 1024, relativePosition: 16 };
    });
    var reader = {
        read: async function(offset, length) {
            assert.ok(length <= 128 * 1024, 'read exceeds the subtitle batch limit');
            var data = new Uint8Array(length);
            data.set(offset === 0 ? clusterHeader : simpleBlock);
            return data;
        }
    };

    var blocks = await matroska.readTargetedBlocks(reader, 0, cues, new Set([3]), 1000000, 1);
    assert.deepEqual(blocks.map(function(block) { return block.timestampMs; }), cues.map(function(cue) { return cue.time; }));
});

test('cancels the body if the origin ignores Range', async function(t) {
    var cancelled = false;
    var body = new ReadableStream({ cancel: function() { cancelled = true; } });
    t.mock.method(globalThis, 'fetch', async function() { return new Response(body, { status: 200 }); });

    await assert.rejects(discoverEmbeddedASS(mediaURL), /valid partial media response/);
    assert.equal(cancelled, true);
});

test('rejects mismatched ranges and truncated bodies', async function(t) {
    var request = t.mock.method(globalThis, 'fetch', async function() {
        return new Response('x', { status: 206, headers: { 'Content-Range': 'bytes 1-9/10' } });
    });
    await assert.rejects(discoverEmbeddedASS(mediaURL), /valid partial media response/);

    request.mock.mockImplementation(async function() {
        return new Response('x', { status: 206, headers: { 'Content-Range': 'bytes 0-9/10' } });
    });
    await assert.rejects(discoverEmbeddedASS(mediaURL), /Truncated media range/);
});

test('rejects a window after media unload or seek cancellation', async function(t) {
    var request = t.mock.method(globalThis, 'fetch', async function(_url, init) {
        return partialResponse(new Headers(init.headers).get('Range'));
    });
    var playback = new AbortController();
    var seek = new AbortController();
    var tracks = await discoverEmbeddedASS(mediaURL, { signal: playback.signal });
    seek.abort();
    await assert.rejects(tracks[0].loadWindow(0, 8000, seek.signal), /cancelled/);
    assert.match(await tracks[0].loadWindow(0, 8000), /Dialogue:/);
    playback.abort();
    await assert.rejects(tracks[0].loadWindow(0, 8000), /cancelled/);
    assert.equal(request.mock.callCount(), 1);
});
