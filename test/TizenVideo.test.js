var assert = require('node:assert/strict');
var EventEmitter = require('node:events');
var fs = require('node:fs');
var path = require('node:path');
var test = require('node:test');
var vm = require('node:vm');

function readAudioTracks(nativeTracks, extendedTracks, version) {
    function Element() { this.style = {}; }
    Element.prototype.appendChild = function() {};
    var avplay = {
        setListener: function() {},
        open: function() {},
        setDisplayRect: function() {},
        setDisplayMethod: function() {},
        seekTo: function() {},
        prepareAsync: function() {},
        getTotalTrackInfo: function() { return nativeTracks; }
    };
    var context = {
        module: { exports: {} },
        require: function(name) {
            if (name === 'eventemitter3') return EventEmitter;
            if (name === 'lodash.clonedeep' || name === 'deep-freeze') return function(value) { return value; };
            if (name === 'color') return function() {};
            if (name === '../error') return {};
            if (name === '../tracksData') return function(url, cb) { cb(extendedTracks || false); };
            throw new Error('Unexpected dependency: ' + name);
        },
        HTMLElement: Element,
        document: { createElement: function() { return new Element(); } },
        navigator: { userAgent: 'SMART-TV; Tizen ' + (version || '5.5') },
        window: { webapis: { avplay: avplay }, innerWidth: 1920, innerHeight: 1080 }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/TizenVideo/TizenVideo.js'), 'utf8'), context);
    var player = new context.module.exports({ containerElement: new Element() });
    player.dispatch({ type: 'command', commandName: 'load', commandArgs: { stream: { url: 'https://example.invalid/test.mkv' } } });
    var result;
    player.on('propValue', function(name, value) { if (name === 'audioTracks') result = value; });
    player.dispatch({ type: 'observeProp', propName: 'audioTracks' });
    return JSON.parse(JSON.stringify(result));
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
