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

test('the streaming-server wrapper accepts supported HLS without relaxing codec checks', async () => {
    const probe = {
        format: { name: 'hls' },
        streams: [{ track: 'video', codec: 'h264' }, { track: 'audio', codec: 'aac', channels: 2 }]
    };
    const wrap = loadModule('src/withStreamingServer/withStreamingServer.js', {
        fetch: () => Promise.resolve(Response.json(probe)), URLSearchParams
    }, {
        '../mediaCapabilities': {},
        '../supportsTranscoding': () => Promise.resolve(true),
        './convertStream': () => {},
        './fetchVideoParams': () => {}
    });
    const Video = { manifest: { name: 'TestVideo', props: [], events: [], commands: [] } };
    const stream = { url: 'https://example.test/stream' };
    const options = {
        streamingServerURL: 'http://localhost:11470',
        formats: ['mp4'], videoCodecs: ['h264'], audioCodecs: ['aac'], maxAudioChannels: 2
    };
    assert.equal(await wrap(Video).canPlayStream(stream, options), true);
    probe.streams[1].codec = 'dts';
    assert.equal(await wrap(Video).canPlayStream(stream, options), false);
});
