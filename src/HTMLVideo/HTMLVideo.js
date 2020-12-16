var EventEmitter = require('eventemitter3');
var Hls = require('hls.js');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var ERROR = require('../error');

function HTMLVideo(options) {
    options = options || {};

    var containerElement = options.containerElement;
    if (!(containerElement instanceof HTMLElement)) {
        throw new Error('Container element required to be instance of HTMLElement');
    }

    var videoElement = document.createElement('video');
    videoElement.style.width = '100%';
    videoElement.style.height = '100%';
    videoElement.style.backgroundColor = 'black';
    videoElement.crossOrigin = 'anonymous';
    videoElement.controls = false;
    videoElement.onerror = function() {
        onVideoError();
    };
    videoElement.onended = function() {
        onEnded();
    };
    videoElement.onpause = function() {
        onPropChanged('paused');
    };
    videoElement.onplay = function() {
        onPropChanged('paused');
    };
    videoElement.ontimeupdate = function() {
        onPropChanged('time');
        onPropChanged('buffered');
    };
    videoElement.ondurationchange = function() {
        onPropChanged('duration');
    };
    videoElement.onwaiting = function() {
        onPropChanged('buffering');
        onPropChanged('buffered');
    };
    videoElement.onseeking = function() {
        onPropChanged('buffering');
        onPropChanged('buffered');
    };
    videoElement.onseeked = function() {
        onPropChanged('buffering');
        onPropChanged('buffered');
    };
    videoElement.onstalled = function() {
        onPropChanged('buffering');
        onPropChanged('buffered');
    };
    videoElement.onplaying = function() {
        onPropChanged('buffering');
        onPropChanged('buffered');
    };
    videoElement.oncanplay = function() {
        onPropChanged('buffering');
        onPropChanged('buffered');
    };
    videoElement.canplaythrough = function() {
        onPropChanged('buffering');
        onPropChanged('buffered');
    };
    videoElement.onloadeddata = function() {
        onPropChanged('buffering');
        onPropChanged('buffered');
    };
    videoElement.onvolumechange = function() {
        onPropChanged('volume');
        onPropChanged('muted');
    };
    containerElement.appendChild(videoElement);

    var hls = null;
    var events = new EventEmitter();
    var destroyed = false;
    var stream = null;
    var observedProps = {
        stream: false,
        paused: false,
        time: false,
        duration: false,
        buffering: false,
        buffered: false,
        volume: false,
        muted: false
    };

    function getProp(propName) {
        switch (propName) {
            case 'stream': {
                return stream;
            }
            case 'paused': {
                if (stream === null) {
                    return null;
                }

                return !!videoElement.paused;
            }
            case 'time': {
                if (stream === null || videoElement.currentTime === null || !isFinite(videoElement.currentTime)) {
                    return null;
                }

                return Math.floor(videoElement.currentTime * 1000);
            }
            case 'duration': {
                if (stream === null || videoElement.duration === null || !isFinite(videoElement.duration)) {
                    return null;
                }

                return Math.floor(videoElement.duration * 1000);
            }
            case 'buffering': {
                if (stream === null) {
                    return null;
                }

                return videoElement.readyState < videoElement.HAVE_FUTURE_DATA;
            }
            case 'buffered': {
                if (stream === null) {
                    return null;
                }

                var time = videoElement.currentTime !== null && isFinite(videoElement.currentTime) ? videoElement.currentTime : 0;
                for (var i = 0; i < videoElement.buffered.length; i++) {
                    if (videoElement.buffered.start(i) <= time && time <= videoElement.buffered.end(i)) {
                        return Math.floor(videoElement.buffered.end(i) * 1000);
                    }
                }

                return Math.floor(time * 1000);
            }
            case 'volume': {
                if (destroyed || videoElement.volume === null || !isFinite(videoElement.volume)) {
                    return null;
                }

                return Math.floor(videoElement.volume * 100);
            }
            case 'muted': {
                if (destroyed) {
                    return null;
                }

                return !!videoElement.muted;
            }
        }
    }
    function onVideoError() {
        if (stream === null) {
            return;
        }

        var error;
        switch (videoElement.error.code) {
            case 1: {
                error = ERROR.HTML_VIDEO.MEDIA_ERR_ABORTED;
                break;
            }
            case 2: {
                error = ERROR.HTML_VIDEO.MEDIA_ERR_NETWORK;
                break;
            }
            case 3: {
                error = ERROR.HTML_VIDEO.MEDIA_ERR_DECODE;
                break;
            }
            case 4: {
                error = ERROR.HTML_VIDEO.MEDIA_ERR_SRC_NOT_SUPPORTED;
                break;
            }
            default: {
                error = ERROR.UNKNOWN_ERROR;
            }
        }
        onError(Object.assign({}, error, {
            critical: true,
            error: videoElement.error
        }));
    }
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
    function setProp(propName, propValue) {
        switch (propName) {
            case 'paused': {
                if (stream !== null) {
                    propValue ? videoElement.pause() : videoElement.play();
                }

                break;
            }
            case 'time': {
                if (stream !== null && propValue !== null && isFinite(propValue)) {
                    videoElement.currentTime = parseInt(propValue, 10) / 1000;
                }

                break;
            }
            case 'volume': {
                if (propValue !== null && isFinite(propValue)) {
                    videoElement.muted = false;
                    videoElement.volume = Math.max(0, Math.min(100, parseInt(propValue, 10))) / 100;
                }

                break;
            }
            case 'muted': {
                videoElement.muted = !!propValue;
                break;
            }
        }
    }
    function command(commandName, commandArgs) {
        switch (commandName) {
            case 'load': {
                command('unload');
                if (commandArgs && commandArgs.stream && typeof commandArgs.stream.url === 'string') {
                    stream = commandArgs.stream;
                    onPropChanged('stream');
                    videoElement.autoplay = typeof commandArgs.autoplay === 'boolean' ? commandArgs.autoplay : true;
                    videoElement.currentTime = commandArgs.time !== null && isFinite(commandArgs.time) ? parseInt(commandArgs.time, 10) / 1000 : 0;
                    onPropChanged('paused');
                    onPropChanged('time');
                    onPropChanged('duration');
                    onPropChanged('buffering');
                    onPropChanged('buffered');
                    getContentType(stream)
                        .then(function(contentType) {
                            if (stream !== commandArgs.stream) {
                                return;
                            }

                            if (contentType === 'application/vnd.apple.mpegurl' && Hls.isSupported()) {
                                hls = new Hls();
                                hls.loadSource(stream.url);
                                hls.attachMedia(videoElement);
                            } else {
                                videoElement.src = stream.url;
                            }
                        })
                        .catch(function() {
                            if (stream !== commandArgs.stream) {
                                return;
                            }

                            videoElement.src = stream.url;
                        });
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
                if (hls !== null) {
                    hls.destroy();
                    hls = null;
                }
                videoElement.removeAttribute('src');
                videoElement.load();
                videoElement.currentTime = 0;
                onPropChanged('stream');
                onPropChanged('paused');
                onPropChanged('time');
                onPropChanged('duration');
                onPropChanged('buffering');
                onPropChanged('buffered');
                break;
            }
            case 'destroy': {
                command('unload');
                destroyed = true;
                onPropChanged('volume');
                onPropChanged('muted');
                events.removeAllListeners();
                videoElement.onerror = null;
                videoElement.onended = null;
                videoElement.onpause = null;
                videoElement.onplay = null;
                videoElement.ontimeupdate = null;
                videoElement.ondurationchange = null;
                videoElement.onwaiting = null;
                videoElement.onseeking = null;
                videoElement.onseeked = null;
                videoElement.onstalled = null;
                videoElement.onplaying = null;
                videoElement.oncanplay = null;
                videoElement.canplaythrough = null;
                videoElement.onloadeddata = null;
                videoElement.onvolumechange = null;
                containerElement.removeChild(videoElement);
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

function getContentType(stream) {
    if (!stream || typeof stream.url !== 'string') {
        return Promise.reject(new Error('Invalid stream parameter!'));
    }

    if (stream.behaviorHints && stream.behaviorHints.headers && typeof stream.behaviorHints.headers['content-type'] === 'string') {
        return Promise.resolve(stream.behaviorHints.headers['content-type']);
    }

    return fetch(stream.url, { method: 'HEAD' })
        .then(function(resp) {
            return resp.headers.get('content-type');
        });
}

HTMLVideo.canPlayStream = function(stream) {
    if (!stream || (stream.behaviorHints && stream.behaviorHints.notWebReady)) {
        return Promise.resolve(false);
    }

    return getContentType(stream)
        .then(function(contentType) {
            var video = document.createElement('video');
            return !!video.canPlayType(contentType) || (contentType === 'application/vnd.apple.mpegurl' && Hls.isSupported());
        })
        .catch(function() {
            return false;
        });
};

HTMLVideo.manifest = {
    name: 'HTMLVideo',
    external: false,
    props: ['stream', 'paused', 'time', 'duration', 'buffering', 'buffered', 'volume', 'muted'],
    commands: ['load', 'unload', 'destroy'],
    events: ['propChanged', 'propValue', 'ended', 'error']
};

module.exports = HTMLVideo;
