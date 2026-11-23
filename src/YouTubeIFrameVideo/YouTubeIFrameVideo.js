var EventEmitter = require('eventemitter3');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var ERROR = require('../error');

function YouTubeIFrameVideo(options) {
    options = options || {};

    var containerElement = options.containerElement;
    if (!(containerElement instanceof HTMLElement)) {
        throw new Error('Container element required to be instance of HTMLElement');
    }

    var ready = false;
    var pendingLoadArgs = null;
    var events = new EventEmitter();
    var destroyed = false;

    var stream = null;
    var buffering = true;
    var paused = true;
    var playbackSpeed = null;
    var time = 0;
    var duration = 0;
    var subtitlesTracks = [];
    var selectedSubtitlesTrackId = null;

    var observedProps = {
        stream: false,
        loaded: false,
        paused: false,
        time: false,
        duration: false,
        buffering: false,
        playbackSpeed: false,
        subtitlesTracks: false,
        selectedSubtitlesTrackId: false
    };

    function onIFrameLoad() {
        if (destroyed) {
            return;
        }

        ready = true;
        if (pendingLoadArgs !== null) {
            command('load', pendingLoadArgs);
            pendingLoadArgs = null;
        }
    }

    function onIFrameError(e) {
        console.error('Failed to load iFrame:', e);
    }

    var iFrameElement = document.createElement('iframe');
    iFrameElement.src = 'https://yt.strem.io';
    iFrameElement.style = 'height: 100%; width: 100%; border: none;';
    iFrameElement.onload = onIFrameLoad;
    iFrameElement.onerror = onIFrameError;
    containerElement.appendChild(iFrameElement);

    function sendAction(name, ...args) {
        try {
            iFrameElement.contentWindow.postMessage(JSON.stringify({
                name,
                args
            }), '*');
        } catch (e) {
            console.error('Failed to send command to iFrame:', e);
        }
    }

    function onMessage(message) {
        var name = message.name;
        var args = message.args;

        if (name === 'ready') {
            ready = true;
            if (pendingLoadArgs !== null) {
                command('load', pendingLoadArgs);
                pendingLoadArgs = null;
            }
        }

        if (name === 'buffering') {
            var value = args[0];
            if (typeof value !== 'boolean') return;

            buffering = value;
            onPropChanged('buffering');
        }

        if (name === 'paused') {
            var value = args[0];
            if (typeof value !== 'boolean') return;

            paused = value;
            onPropChanged('paused');
        }

        if (name === 'playbackRate') {
            var value = args[0];
            if (!isFinite(value)) return;

            playbackSpeed = value;
            onPropChanged('playbackSpeed');
        }

        if (name === 'time') {
            var value = args[0];
            if (!isFinite(value)) return;

            time = value;
            onPropChanged('time');
        }

        if (name === 'duration') {
            var value = args[0];
            if (!isFinite(value)) return;

            duration = value;
            onPropChanged('duration');
        }

        if (name === 'textTracks') {
            var value = args[0];
            if (!Array.isArray(value)) return;

            subtitlesTracks = value.map(function(track, index) {
                return Object.freeze({
                    id: 'EMBEDDED_' + String(index),
                    lang: track.languageCode,
                    label: typeof track.displayName === 'string' ? track.displayName : track.languageCode,
                    origin: 'EMBEDDED',
                    embedded: true
                });
            });

            onPropChanged('subtitlesTracks');
        }

        if (name === 'ended') {
            onEnded();
        }

        if (name === 'error') {
            var value = args[0];
            if (typeof value !== 'number') return;

            var error;
            switch (value) {
                case 2: {
                    error = ERROR.YOUTUBE_VIDEO.INVALID_PARAMETER;
                    break;
                }
                case 5: {
                    error = ERROR.YOUTUBE_VIDEO.HTML5_VIDEO;
                    break;
                }
                case 100: {
                    error = ERROR.YOUTUBE_VIDEO.VIDEO_NOT_FOUND;
                    break;
                }
                case 101:
                case 150: {
                    error = ERROR.YOUTUBE_VIDEO.VIDEO_NOT_EMBEDDABLE;
                    break;
                }
                default: {
                    error = ERROR.UNKNOWN_ERROR;
                }
            }

            onError(Object.assign({}, error, {
                critical: true,
                error: value
            }));
        }
    }

    window.addEventListener('message', (event) => {
        try {
            var message = JSON.parse(event.data);
            onMessage(message);
        } catch (e) {
            console.error('Failed to parse message', e);
        }
    });

    function onError(error) {
        events.emit('error', error);
        if (error.critical) {
            command('unload');
        }
    }

    function onEnded() {
        events.emit('ended');
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

    function getProp(propName) {
        switch (propName) {
            case 'stream': {
                return stream;
            }
            case 'loaded': {
                if (stream === null) return false;
                return true;
            }
            case 'buffering': {
                if (stream === null || typeof buffering !== 'boolean') return true;
                return buffering;
            }
            case 'paused': {
                if (stream === null || typeof buffering !== 'boolean') return true;
                return paused;
            }
            case 'playbackSpeed': {
                if (stream === null || !isFinite(playbackSpeed)) return 1;
                return playbackSpeed;
            }
            case 'subtitlesTracks': {
                if (stream === null || !Array.isArray(subtitlesTracks)) return [];
                return subtitlesTracks;
            }
            case 'selectedSubtitlesTrackId': {
                if (stream === null || typeof selectedSubtitlesTrackId !== 'string') return null;
                return selectedSubtitlesTrackId;
            }
            case 'time': {
                if (stream === null || !isFinite(time)) return 0;
                return time;
            }
            case 'duration': {
                if (stream === null || !isFinite(duration)) return 0;
                return duration;
            }
            default: {
                return null;
            }
        }
    }

    function setProp(propName, propValue) {
        switch (propName) {
            case 'paused': {
                if (stream !== null) {
                    propValue ? sendAction('pauseVideo') : sendAction('playVideo');
                }

                break;
            }
            case 'time': {
                if (stream !== null && propValue !== null && isFinite(propValue)) {
                    sendAction('seekTo', parseInt(propValue, 10) / 1000);
                }

                break;
            }
            case 'playbackSpeed': {
                if (stream !== null && isFinite(propValue)) {
                    sendAction('setPlaybackRate', propValue);
                    onPropChanged('playbackSpeed');
                }

                break;
            }
            case 'selectedSubtitlesTrackId': {
                if (stream !== null) {
                    selectedSubtitlesTrackId = null;
                    var selectedTrack = getProp('subtitlesTracks')
                        .find(function(track) {
                            return track.id === propValue;
                        });

                    if (selectedTrack) {
                        selectedSubtitlesTrackId = selectedTrack.id;

                        sendAction('setTextTrack', selectedTrack.lang);
                        events.emit('subtitlesTrackLoaded', selectedTrack);
                    } else {
                        sendAction('setTextTrack', null);
                    }
                    onPropChanged('selectedSubtitlesTrackId');
                }

                break;
            }
        }
    }

    function command(commandName, commandArgs) {
        switch (commandName) {
            case 'load': {
                command('unload');
                if (commandArgs && commandArgs.stream && typeof commandArgs.stream.ytId === 'string') {
                    if (ready) {
                        stream = commandArgs.stream;
                        onPropChanged('stream');
                        onPropChanged('loaded');
                        var autoplay = typeof commandArgs.autoplay === 'boolean' ? commandArgs.autoplay : true;
                        var time = commandArgs.time !== null && isFinite(commandArgs.time) ? parseInt(commandArgs.time, 10) / 1000 : 0;
                        var ytId = commandArgs.stream.ytId;
                        if (autoplay) {
                            sendAction('loadVideoById', ytId, time);
                        } else {
                            sendAction('cueVideoById', ytId, time);
                        }
                    } else {
                        pendingLoadArgs = commandArgs;
                    }
                } else {
                    onError(Object.assign({}, ERROR.UNSUPPORTED_STREAM, {
                        critical: true,
                        stream: commandArgs ? commandArgs.stream : null
                    }));
                }

                break;
            }
            case 'unload': {
                pendingLoadArgs = null;
                stream = null;
                onPropChanged('stream');
                onPropChanged('loaded');
                sendAction('stopVideo');
                break;
            }
            case 'destroy': {
                command('unload');
                destroyed = true;
                events.removeAllListeners();
                sendAction('destroy');
                containerElement.removeChild(iFrameElement);
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

YouTubeIFrameVideo.canPlayStream = function(stream) {
    return Promise.resolve(stream && typeof stream.ytId === 'string');
};

YouTubeIFrameVideo.manifest = {
    name: 'YouTubeIFrameVideo',
    external: false,
    props: ['stream', 'loaded', 'paused', 'time', 'duration', 'buffering', 'playbackSpeed', 'subtitlesTracks', 'selectedSubtitlesTrackId'],
    commands: ['load', 'unload', 'destroy'],
    events: ['propValue', 'propChanged', 'ended', 'error', 'subtitlesTrackLoaded']
};

module.exports = YouTubeIFrameVideo;
