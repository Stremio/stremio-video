var assert = require('node:assert/strict');
var test = require('node:test');
var TizenVideo = require('../src/TizenVideo/TizenVideo');

test('reports native AVPlay connection failures and ignores errors after unload', function() {
    var listener;
    var prepare;
    var stops = 0;
    var avplay = {
        setListener: function(callbacks) { listener = callbacks; },
        open: function() {},
        setDisplayRect: function() {},
        setDisplayMethod: function() {},
        seekTo: function() {},
        play: function() {},
        prepareAsync: function(success) { prepare = success; },
        stop: function() { stops++; }
    };

    function Element() { this.style = {}; }
    Element.prototype.appendChild = function() {};
    global.HTMLElement = Element;
    global.document = { createElement: function() { return new Element(); } };
    global.window = { webapis: { avplay: avplay } };
    Object.defineProperty(global, 'navigator', { value: { userAgent: 'Tizen 5.5' }, configurable: true });

    var video = new TizenVideo({ containerElement: new Element() });
    var errors = [];
    video.on('error', function(error) { errors.push(error); });
    video.dispatch({ type: 'command', commandName: 'load', commandArgs: { stream: { url: 'https://example.test/movie' } } });
    prepare();
    listener.onerror('PLAYER_ERROR_CONNECTION_FAILED');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, 81);
    assert.equal(errors[0].avplayError, 'PLAYER_ERROR_CONNECTION_FAILED');
    assert.equal(stops, 1);
    listener.onerror('PLAYER_ERROR_CONNECTION_FAILED');
    assert.equal(errors.length, 1);
});
