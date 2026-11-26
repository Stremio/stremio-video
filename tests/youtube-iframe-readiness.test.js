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

test('YouTube iframe accepts only messages from its own origin and window', () => {
    const origin = 'https://yt.strem.io';
    const destinations = [];
    const attributes = {};
    const iframe = {
        setAttribute: (name, value) => { attributes[name] = value; },
        contentWindow: { postMessage: (_data, target) => destinations.push(target) }
    };
    class Element {
        appendChild() {}
        removeChild() {}
    }
    let messageHandler;
    const YouTubeIFrameVideo = loadModule('src/YouTubeIFrameVideo/YouTubeIFrameVideo.js', {
        HTMLElement: Element,
        document: { createElement: () => iframe },
        window: {
            addEventListener: (_name, listener) => { messageHandler = listener; },
            removeEventListener: (_name, listener) => {
                assert.equal(listener, messageHandler);
                messageHandler = null;
            }
        }
    });
    const player = new YouTubeIFrameVideo({ containerElement: new Element() });
    let ended = 0;
    player.on('ended', () => ended++);
    player.dispatch({ type: 'command', commandName: 'load', commandArgs: { stream: { ytId: 'test' } } });
    assert.deepEqual(destinations, []);
    messageHandler({ origin, source: iframe.contentWindow, data: JSON.stringify({ name: 'ready', args: [] }) });
    assert.deepEqual(destinations, [origin, origin]);
    const data = JSON.stringify({ name: 'ended', args: [] });
    messageHandler({ origin: 'https://other.test', source: iframe.contentWindow, data });
    messageHandler({ origin, source: {}, data });
    assert.equal(ended, 0);
    messageHandler({ origin, source: iframe.contentWindow, data });
    assert.equal(ended, 1);
    assert.match(attributes.allow, /fullscreen/);
    player.dispatch({ type: 'command', commandName: 'destroy' });
    assert.equal(messageHandler, null);
    assert.deepEqual(destinations, [origin, origin, origin, origin]);
});
