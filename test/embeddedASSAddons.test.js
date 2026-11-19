var assert = require('node:assert/strict');
var EventEmitter = require('node:events');
var tick = require('node:timers/promises').setImmediate;
var test = require('node:test');
var platform = require('../src/platform');
var withHTMLSubtitles = require('../src/withHTMLSubtitles');

class PlayerElement {
    constructor() {
        this.style = {};
        this.children = [];
    }
    appendChild(child) {
        this.children.push(child);
        child.parentElement = this;
    }
    removeChild(child) {
        this.children.splice(this.children.indexOf(child), 1);
    }
    hasChildNodes() { return this.children.length > 0; }
    get lastChild() { return this.children[this.children.length - 1]; }
    querySelector() { return null; }
    getBoundingClientRect() { return { width: 0, height: 0 }; }
    getContext() { return { clearRect: function() {} }; }
}

class NativeVideo extends EventEmitter {
    dispatch(action) {
        if (action.type === 'observeProp') {
            // AVPlay may still report the old native selection while clearing it.
            this.emit('propValue', action.propName, NativeVideo.properties[action.propName]);
        }
    }
}
NativeVideo.properties = {
    subtitlesTracks: [{ id: 'EMBEDDED_2', _trackNumber: 3, lang: 'por' }],
    selectedSubtitlesTrackId: 'EMBEDDED_2',
    time: 2000
};
NativeVideo.manifest = {
    name: 'NativeTizenVideo',
    props: Object.keys(NativeVideo.properties),
    commands: ['load', 'unload', 'destroy'],
    events: ['propValue', 'propChanged', 'subtitlesTrackLoaded', 'error']
};

test('leaves an addon subtitle selected when embedded ASS is discovered and supports switching between them', async function(t) {
    var document = {
        createElement: function() { return new PlayerElement(); },
        createTextNode: function(text) { return { textContent: text }; }
    };
    Object.assign(globalThis, {
        document: document,
        window: {
            document: document,
            devicePixelRatio: 1,
            VTTCue: function(startTime, endTime, text) {
                this.startTime = startTime;
                this.endTime = endTime;
                this.text = text;
            }
        },
        HTMLElement: PlayerElement,
        HTMLVideoElement: class {},
        requestAnimationFrame: function() { return 1; },
        cancelAnimationFrame: function() {}
    });
    platform.set('Tizen');

    var addonASS = '[Script Info]\nScriptType: v4.00+\n[Events]\n' +
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n' +
        'Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Subtitle from an ASS addon\n';
    var files = {
        'addon-srt': '1\n00:00:01,000 --> 00:00:04,000\nSubtitle from an SRT addon\n',
        'addon-vtt': 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nSubtitle from a VTT addon\n\n',
        'addon-ass': addonASS
    };
    var addonTracks = Object.keys(files).map(function(id) {
        var extension = id.slice('addon-'.length);
        return { id: id, lang: 'por', label: extension, origin: 'subtitle-addon', url: 'https://example.test/' + id + '.' + extension };
    });
    t.mock.method(globalThis, 'fetch', async function(url) {
        var track = addonTracks.find(function(candidate) { return candidate.url === url; });
        assert.ok(track, 'only addon subtitle URLs use the external fetch');
        return new Response(files[track.id]);
    });

    var Player = withHTMLSubtitles(NativeVideo);
    var player = new Player({ containerElement: new PlayerElement() });
    t.after(function() { player.dispatch({ type: 'command', commandName: 'destroy' }); });
    var props = {};
    var loaded = [];
    var errors = [];
    function updateProps(name, value) { props[name] = value; }
    player.on('propValue', updateProps);
    player.on('propChanged', updateProps);
    player.on('extraSubtitlesTrackLoaded', function(track) { loaded.push(track.id); });
    player.on('subtitlesTrackLoaded', function(track) { loaded.push(track.id); });
    player.on('error', function(error) { errors.push(error); });
    player.dispatch({ type: 'command', commandName: 'load', commandArgs: { stream: {}, assSubtitlesStyling: true } });
    ['time', 'subtitlesTracks', 'selectedSubtitlesTrackId', 'extraSubtitlesTracks',
        'selectedExtraSubtitlesTrackId', 'extraSubtitlesPreview', 'assSubtitlesStylingActive'].forEach(function(name) {
        player.dispatch({ type: 'observeProp', propName: name });
    });
    function select(name, id) {
        player.dispatch({ type: 'setProp', propName: name, propValue: id });
    }
    player.dispatch({ type: 'command', commandName: 'addExtraSubtitlesTracks', commandArgs: { tracks: addonTracks } });
    select('selectedExtraSubtitlesTrackId', 'addon-srt');
    await tick();
    assert.deepEqual(errors, []);
    assert.deepEqual(loaded, ['addon-srt']);
    assert.equal(props.extraSubtitlesPreview[0].text, 'Subtitle from an SRT addon');

    var loadWindow = t.mock.fn(async function() { return addonASS; });
    player.dispatch({ type: 'command', commandName: 'addEmbeddedASSSources', commandArgs: { sources: [
        { trackId: 'EMBEDDED_ASS_3', codec: 'ass', lang: 'por', windowed: true, url: 'https://example.test/movie.mkv', loadWindow: loadWindow }
    ] } });
    await tick();
    assert.equal(props.selectedExtraSubtitlesTrackId, 'addon-srt');
    assert.equal(loadWindow.mock.callCount(), 0);
    assert.deepEqual(props.subtitlesTracks.map(function(track) { return track.id; }), ['EMBEDDED_ASS_3']);
    assert.deepEqual(props.extraSubtitlesTracks.map(function(track) { return track.id; }), Object.keys(files));

    select('selectedSubtitlesTrackId', 'EMBEDDED_ASS_3');
    await tick();
    assert.equal(props.selectedExtraSubtitlesTrackId, null);
    assert.equal(loadWindow.mock.callCount(), 1);

    select('selectedExtraSubtitlesTrackId', 'addon-vtt');
    await tick();
    assert.equal(props.extraSubtitlesPreview[0].text, 'Subtitle from a VTT addon');
    select('selectedExtraSubtitlesTrackId', 'addon-ass');
    await tick();
    assert.equal(props.selectedExtraSubtitlesTrackId, 'addon-ass');
    assert.equal(props.assSubtitlesStylingActive, true);
    assert.deepEqual(loaded, ['addon-srt', 'EMBEDDED_ASS_3', 'addon-vtt', 'addon-ass']);
    assert.deepEqual(errors, []);
});
