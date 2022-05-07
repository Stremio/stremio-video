var EventEmitter = require('eventemitter3');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var ERROR = require('../error');

var eventMethod = window.addEventListener ? 'addEventListener' : 'attachEvent';
var eventer = window[eventMethod];
var messageEvent = eventMethod === 'attachEvent' ? 'onmessage' : 'message';

function IFrameVideo(options) {
    options = options || {};

    var containerElement = options.containerElement;
    if (!(containerElement instanceof HTMLElement)) {
        throw new Error('Container element required to be instance of HTMLElement');
    }

    var iframeElement = document.createElement('iframe');
    iframeElement.style.width = '100%';
    iframeElement.style.height = '100%';
    iframeElement.style.border = 0;
    iframeElement.style.backgroundColor = 'black';
    iframeElement.allowFullscreen = false;
    iframeElement.allow = 'autoplay';
    containerElement.appendChild(iframeElement);

    // Listen to message from child window
    function onChildMessage(e) {
        source = e.source;
        var key = e.message ? 'message' : 'data';
        var data = e[key];
        if ((data || {}).propName) {
            iframeProps[data.propName] = data.propValue;
            onPropChanged(data.propName, data.propValue);
        }
    }

    eventer(messageEvent, onChildMessage, false);

    var events = new EventEmitter();
    var destroyed = false;
    var stream = null;
    var source = false;

    var iframeProps = {
        paused: false,
        time: 0,
        duration: 0,
        buffering: 0,
        buffered: false,
        volume: 100,
        muted: false,
        playbackSpeed: false
    };

    var observedProps = {
        stream: false,
        paused: false,
        time: false,
        duration: false,
        buffering: false,
        buffered: false,
        volume: false,
        muted: false,
        playbackSpeed: false
    };

    function getProp(propName) {
        switch (propName) {
            case 'stream': {
                return stream;
            }
            case 'paused': {
                return iframeProps.paused;
            }
            case 'time': {
                return iframeProps.time;
            }
            case 'duration': {
                return iframeProps.duration;
            }
            case 'buffered': {
                return iframeProps.buffered;
            }
            case 'buffering': {
                return iframeProps.buffering;
            }
            case 'volume': {
                return iframeProps.volume;
            }
            case 'muted': {
                return iframeProps.muted;
            }
            case 'playbackSpeed': {
                return iframeProps.playbackSpeed;
            }

            default: {
                return null;
            }
        }
    }
    function onError(error) {
        events.emit('error', error);
        if (error.critical) {
            command('unload');
        }
    }
    function onPropChanged(propName) {
        if (observedProps[propName]) {
            events.emit('propChanged', propName, getProp(propName));
        }
    }
    function observeProp(propName) {
        if (observedProps.hasOwnProperty(propName)) {
            events.emit('propValue', propName, getProp(propName));
            observedProps[propName] = true;
        }
    }
    function setProp(propName, propValue) {
        if (source) {
            source.postMessage({ propName: propName, propValue: propValue }, '*');
        }
    }
    function command(commandName, commandArgs) {
        switch (commandName) {
            case 'load': {
                command('unload');
                if (commandArgs && commandArgs.stream && typeof commandArgs.stream.playerFrameUrl === 'string') {
                    stream = commandArgs.stream;
                    onPropChanged('stream');
                    iframeElement.src = commandArgs.stream.playerFrameUrl;
                } else {
                    onError(Object.assign({}, ERROR.UNSUPPORTED_STREAM, {
                        critical: true,
                        stream: commandArgs ? commandArgs.stream : null
                    }));
                }
                break;
            }
            case 'unload': {
                stream = null;
                source = null;
                window.removeEventListener(messageEvent, onChildMessage);
                iframeElement.removeAttribute('src');
                onPropChanged('stream');
                break;
            }
            case 'destroy': {
                command('unload');
                destroyed = true;
                events.removeAllListeners();
                containerElement.removeChild(iframeElement);
                break;
            }
        }
    }

    this.on = function(eventName, listener) {
        if (destroyed) {
            throw new Error('Video is destroyed');
        }

        events.on(eventName, listener);
    };
    this.dispatch = function(action) {
        if (destroyed) {
            throw new Error('Video is destroyed');
        }

        if (action) {
            action = deepFreeze(cloneDeep(action));
            switch (action.type) {
                case 'observeProp': {
                    observeProp(action.propName);
                    return;
                }
                case 'setProp': {
                    setProp(action.propName, action.propValue);
                    return;
                }
                case 'command': {
                    command(action.commandName, action.commandArgs);
                    return;
                }
            }
        }

        throw new Error('Invalid action dispatched: ' + JSON.stringify(action));
    };
}

IFrameVideo.canPlayStream = function(stream) {
    return Promise.resolve(stream && typeof stream.playerFrameUrl === 'string');
};

IFrameVideo.manifest = {
    name: 'IFrameVideo',
    external: false,
    props: ['stream', 'paused', 'time', 'duration', 'buffering', 'buffered', 'volume', 'muted', 'playbackSpeed'],
    commands: ['load', 'unload', 'destroy'],
    events: ['propValue', 'propChanged', 'error']
};

module.exports = IFrameVideo;
