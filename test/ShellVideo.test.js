var test = require('node:test');
var assert = require('node:assert/strict');
var EventEmitter = require('eventemitter3');
var ShellVideo = require('../src/ShellVideo/ShellVideo');

global.window = {
    document: {
        getElementsByTagName: function() {
            return [{ style: {} }];
        },
    },
};

function createVideo() {
    var ipc = new EventEmitter();
    ipc.send = function() {};
    var video = new ShellVideo({
        shellTransport: ipc,
        containerElement: {
            style: {},
            parentElement: null,
        },
    });
    var loadedValues = [];

    video.on('propChanged', function(propName, propValue) {
        if (propName === 'loaded') {
            loadedValues.push(propValue);
        }
    });
    video.dispatch({
        type: 'observeProp',
        propName: 'loaded',
    });

    return {
        ipc: ipc,
        video: video,
        loadedValues: loadedValues,
    };
}

function emitLegacyReadyProps(ipc) {
    ipc.emit('mpv-prop-change', {
        name: 'duration',
        data: 120,
    });
    ipc.emit('mpv-prop-change', {
        name: 'video-params',
        data: { w: 1920, h: 1080 },
    });
    ipc.emit('mpv-prop-change', {
        name: 'paused-for-cache',
        data: false,
    });
}

test('marks legacy shell playback as loaded from mpv properties', function() {
    var context = createVideo();

    emitLegacyReadyProps(context.ipc);

    assert.deepEqual(context.loadedValues, [true]);
    context.video.dispatch({
        type: 'command',
        commandName: 'destroy',
    });
});

test('waits for native readiness when supported by the shell', function() {
    var context = createVideo();

    context.ipc.emit('mpv-event-video-ready', {
        loadId: 1,
        ready: false,
    });
    emitLegacyReadyProps(context.ipc);
    assert.deepEqual(context.loadedValues, []);

    context.ipc.emit('mpv-event-video-ready', {
        loadId: 1,
        ready: true,
    });
    assert.deepEqual(context.loadedValues, [true]);
    context.video.dispatch({
        type: 'command',
        commandName: 'destroy',
    });
});
