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

test('torrent creation requires a selected file and reports an empty response', async () => {
    let reply = new Response('', { status: 200 });
    let calls = 0;
    const createTorrent = loadModule('src/withStreamingServer/createTorrent.js', {
        fetch: () => { calls++; return Promise.resolve(reply); },
        setTimeout, clearTimeout, URLSearchParams, AbortController
    });
    const server = 'http://localhost:11470';
    await assert.rejects(createTorrent(server, 'hash', null), {
        name: 'TorrentCreateError', message: /empty response/
    });
    reply = new Response('{}');
    await assert.rejects(createTorrent(server, 'hash', null), {
        name: 'TorrentCreateError', message: /did not select/
    });
    reply = new Response('{"guessedFileIdx":0}');
    assert.equal((await createTorrent(server, 'hash', null)).url, server + '/hash/0');

    assert.equal((await createTorrent(server, 'hash', 2)).url, server + '/hash/2');
    assert.equal(calls, 3);
});

test('torrent creation times out while reading the body and aborts the request', async () => {
    let timeout;
    let signal;
    let cleared = false;
    const createTorrent = loadModule('src/withStreamingServer/createTorrent.js', {
        fetch: (_url, request) => {
            signal = request.signal;
            return Promise.resolve({ ok: true, text: () => new Promise(() => {}) });
        },
        setTimeout: (callback) => { timeout = callback; return 1; },
        clearTimeout: (handle) => { cleared = handle === 1; },
        URLSearchParams, AbortController
    });
    const result = createTorrent('http://localhost:11470', 'hash', null);
    await new Promise(setImmediate);
    timeout();
    await assert.rejects(result, { name: 'TorrentCreateError', message: /timed out/ });
    assert.equal(signal.aborted, true);
    assert.equal(cleared, true);
});
