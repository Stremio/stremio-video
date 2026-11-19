const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const vm = require('node:vm');

function loadModule(path, globals = {}, mocks = {}) {
    const filename = resolve(__dirname, '..', path);
    const localRequire = createRequire(filename);
    const module = { exports: {} };
    vm.runInNewContext(readFileSync(filename, 'utf8'), {
        module,
        require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : localRequire(name),
        ...globals
    }, { filename });
    return module.exports;
}

test('HLS emits the audio track event only after a confirmed switch', async () => {
    class Element {
        appendChild() {}
        addEventListener() {}
        removeAttribute() {}
        load() {}
    }
    let hls;
    class Hls {
        static Events = Object.fromEntries([
            'LEVEL_UPDATED', 'ERROR', 'AUDIO_TRACKS_UPDATED', 'AUDIO_TRACK_SWITCHED',
            'SUBTITLE_TRACKS_UPDATED', 'SUBTITLE_TRACKS_CLEARED', 'SUBTITLE_TRACK_SWITCH', 'MANIFEST_LOADING'
        ].map((name) => [name, name]));
        static isSupported() { return true; }
        constructor() {
            hls = this;
            this.handlers = {};
            this.audioTracks = [
                { id: 0, groupId: 'main', name: 'English' },
                { id: 1, groupId: 'main', name: 'French' }
            ];
            this.allAudioTracks = [{ id: 1, groupId: 'other', name: 'Commentary' }, ...this.audioTracks];
            this.audioTrack = 0;
        }
        on(name, handler) { this.handlers[name] = handler; }
        setAudioOption(track) { this.requested = track; }
        loadSource() {}
        attachMedia() {}
        destroy() {}
    }
    const media = Object.assign(new Element(), { style: {}, textTracks: [] });
    const HTMLVideo = loadModule('src/HTMLVideo/HTMLVideo.js', {
        HTMLElement: Element,
        document: {
            createElement: (type) => type === 'video' ? media : { sheet: { insertRule() {} } }
        }
    }, { 'hls.js': Hls, './getContentType': () => Promise.resolve('application/vnd.apple.mpegurl') });
    const player = new HTMLVideo({ containerElement: new Element() });
    const loaded = [];
    player.on('audioTrackLoaded', (track) => loaded.push(track.id));
    player.dispatch({ type: 'command', commandName: 'load', commandArgs: { stream: { url: 'https://example.test/main.m3u8' } } });
    await new Promise(setImmediate);
    player.dispatch({ type: 'setProp', propName: 'selectedAudioTrackId', propValue: 'EMBEDDED_2' });
    assert.equal(hls.requested.name, 'French');
    assert.deepEqual(loaded, []);
    hls.audioTrack = 1;
    hls.handlers.AUDIO_TRACK_SWITCHED('switch', { ...hls.audioTracks[1] });
    assert.deepEqual(loaded, ['EMBEDDED_2']);
    player.dispatch({ type: 'command', commandName: 'unload' });
    hls.handlers.AUDIO_TRACK_SWITCHED('switch', { ...hls.audioTracks[1] });
    assert.deepEqual(loaded, ['EMBEDDED_2']);
});
