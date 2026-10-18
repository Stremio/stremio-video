var assert = require('node:assert/strict');
var EventEmitter = require('node:events');
var fs = require('node:fs');
var path = require('node:path');
var test = require('node:test');
var vm = require('node:vm');

function makePlayer(nativeTracks, extendedTracks, deferMetadata, deferPrepare) {
    var metadataRequests = [];
    var preparations = [];
    var state = "PLAYING";
    var selections = [];
    var plays = 0;
    function Element() { this.style = {}; }
    Element.prototype.appendChild = function() {};
    var avplay = {
        setListener: function() {},
        open: function() {},
        setDisplayRect: function() {},
        setDisplayMethod: function() {},
        seekTo: function() {},
        prepareAsync: function(success) { preparations.push(success); if (!deferPrepare) success(); },
        play: function() { plays++; state = "PLAYING"; },
        stop: function() {},
        getState: function() { return state; },
        getCurrentStreamInfo: function() { return nativeTracks; },
        setSelectTrack: function(type, index) { selections.push([type, index]); },
        getTotalTrackInfo: function() { return nativeTracks; }
    };
    var context = {
        module: { exports: {} },
        require: function(name) {
            if (name === 'eventemitter3') return EventEmitter;
            if (name === 'lodash.clonedeep' || name === 'deep-freeze') return function(value) { return value; };
            if (name === 'color') return function() {};
            if (name === '../error') return {};
            if (name === './mapTracksData') return require('../src/TizenVideo/mapTracksData');
            if (name === '../tracksData') return function(url, cb, server) { metadataRequests.push({ url: url, cb: cb, server: server }); if (!deferMetadata) cb(extendedTracks || false); };
            throw new Error('Unexpected dependency: ' + name);
        },
        HTMLElement: Element,
        document: { createElement: function() { return new Element(); } },
        navigator: { userAgent: 'SMART-TV; Tizen 5.5' },
        window: { webapis: { avplay: avplay }, innerWidth: 1920, innerHeight: 1080 }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/TizenVideo/TizenVideo.js'), 'utf8'), context);
    var player = new context.module.exports({ containerElement: new Element() });
    return {
        player: player, metadata: metadataRequests, preparations: preparations, selections: selections,
        getPlays: function() { return plays; },
        setState: function(value) { state = value; },
        load: function(url, server) { player.dispatch({ type: 'command', commandName: 'load', commandArgs: { stream: { url: url }, streamingServerURL: server } }); },
        unload: function() { player.dispatch({ type: 'command', commandName: 'unload' }); },
        prop: function(prop) {
            var result;
            player.on('propValue', function(name, value) { if (name === prop) result = value; });
            player.dispatch({ type: 'observeProp', propName: prop });
            return result === undefined ? result : JSON.parse(JSON.stringify(result));
        },
        select: function(prop, value) { player.dispatch({ type: 'setProp', propName: prop, propValue: value }); }
    };
}
function readAudioTracks(nativeTracks, extendedTracks) {
    var harness = makePlayer(nativeTracks, extendedTracks);
    harness.load('https://example.invalid/test.mkv');
    return harness.prop('audioTracks');
}

function audio(index, language) {
    return { type: 'AUDIO', index: index, extra_info: JSON.stringify({ language: language }) };
}

test('normalizes Samsung Spanish audio without changing reindexed track IDs', function() {
    // Native metadata observed on Tizen 5.5 / AVPlay 4.0 after unsupported
    // TrueHD and DTS streams were omitted from an MKV track list.
    var tracks = readAudioTracks([
        { type: 'VIDEO', index: 0, extra_info: '{}' },
        audio(1, 'eng'), audio(2, 'eng'), audio(3, 'eng'),
        audio(4, 'fre'), audio(5, 'esa'), audio(6, 'por'), audio(7, 'eng')
    ]);
    assert.equal(tracks.length, 7);
    assert.equal(tracks[4].lang, 'spa');
    assert.equal(tracks[4].id, 'EMBEDDED_5');
    assert.deepEqual(tracks.map(function(track) { return track.lang; }), ['eng', 'eng', 'eng', 'fre', 'spa', 'por', 'eng']);
});

test('preserves canonical Spanish and unrelated or missing language metadata', function() {
    var tracks = readAudioTracks([audio(0, 'spa'), audio(1, 'es'), audio(2, 'es-419'), audio(3, 'unknown'), audio(4, ''), audio(5, null)]);
    assert.deepEqual(tracks.map(function(track) { return track.lang; }), ['spa', 'es', 'es-419', 'unknown', null, null]);
});

test('continues to prefer extended metadata when available', function() {
    var tracks = readAudioTracks([audio(1, 'esa')], { audio: [{ id: 2, lang: 'es', label: 'Spanish AC3' }], subs: [] }, '6.0');
    assert.equal(tracks[0].lang, 'es');
    assert.equal(tracks[0].label, 'Spanish AC3');
    assert.equal(tracks[0].id, 'EMBEDDED_1');
});


test('requests metadata from the configured server on Tizen 5.5', function() {
    var h = makePlayer([audio(1, 'eng')], null, true);
    h.load('https://example.invalid/first.mkv', 'http://example.invalid:11470');
    assert.equal(h.metadata[0].server, 'http://example.invalid:11470');
});
test('clears metadata on every load and ignores an older response', function() {
    var h = makePlayer([audio(1, 'eng')], null, true);
    h.load('https://example.invalid/first.mkv');
    h.metadata[0].cb({ audio: [{ id: 2, lang: 'fr', label: 'First file' }], subs: [] });
    assert.equal(h.prop('audioTracks')[0].label, 'First file');
    h.load('https://example.invalid/second.mkv');
    assert.equal(h.prop('audioTracks')[0].label, null);
    h.metadata[0].cb({ audio: [{ id: 2, lang: 'fr', label: 'Stale' }], subs: [] });
    assert.equal(h.prop('audioTracks')[0].label, null);
    h.metadata[1].cb({ audio: [{ id: 3, lang: 'pt', label: 'Second file' }], subs: [] });
    assert.equal(h.prop('audioTracks')[0].label, 'Second file');
});
test('ignores a response after unload and re-fetches when the same URL is reopened', function() {
    var h = makePlayer([audio(1, 'eng')], null, true);
    h.load('https://example.invalid/same.mkv'); h.unload();
    h.metadata[0].cb({ audio: [{ id: 2, lang: 'fr' }], subs: [] });
    assert.deepEqual(h.prop('audioTracks'), []);
    h.load('https://example.invalid/same.mkv');
    assert.equal(h.metadata.length, 2);
    assert.equal(h.prop('audioTracks')[0].lang, 'eng');
});
test('does not play or fetch metadata from a superseded prepare callback', function() {
    var h = makePlayer([audio(1, 'eng')], null, true, true);
    h.load('https://example.invalid/first.mkv');
    h.load('https://example.invalid/second.mkv');
    h.preparations[0](); assert.equal(h.getPlays(), 0); assert.equal(h.metadata.length, 0);
    h.preparations[1](); assert.equal(h.getPlays(), 1); assert.equal(h.metadata.length, 1);
});
test('clears a deferred paused audio selection before another file loads', function() {
    var h = makePlayer([audio(1, 'eng')], null, true);
    h.load('https://example.invalid/first.mkv'); h.setState('PAUSED');
    h.select('selectedAudioTrackId', 'EMBEDDED_1');
    h.load('https://example.invalid/second.mkv');
    h.prop('paused');
    assert.deepEqual(h.selections, []);
});
test('ignores an audio ID absent from the native list', function() {
    var h = makePlayer([audio(1, 'eng')], null, true);
    h.load('https://example.invalid/test.mkv');
    h.select('selectedAudioTrackId', 'EMBEDDED_99');
    h.select('selectedAudioTrackId', null);
    assert.deepEqual(h.selections, []);
});
test('reports a selected subtitle at native index zero', function() {
    var h = makePlayer([{ type: 'TEXT', index: 0, extra_info: '{"track_lang":"en"}' }], null, true);
    h.load('https://example.invalid/test.mkv');
    h.select('selectedSubtitlesTrackId', 'EMBEDDED_0');
    assert.equal(h.prop('selectedSubtitlesTrackId'), 'EMBEDDED_0');
});


test('keeps tracks with malformed or null native metadata in the list', function() {
    var h = makePlayer([
        { type: 'AUDIO', index: 1, extra_info: 'null' },
        { type: 'AUDIO', index: 2, extra_info: '{invalid' },
        { type: 'TEXT', index: 3, extra_info: 'null' }
    ], null, true);
    h.load('https://example.invalid/test.mkv');
    assert.equal(h.prop('audioTracks').length, 2);
    assert.equal(h.prop('subtitlesTracks').length, 1);
});
