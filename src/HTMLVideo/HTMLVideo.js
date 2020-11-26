var EventEmitter = require('events');
var Hls = require('hls.js');
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
    videoElement.onplaying = function() {
        onPropChanged('buffering');
        onPropChanged('buffered');
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

    var events = new EventEmitter();
    events.on('error', function() { });

    var hls = null;
    var destroyed = false;
    var loaded = false;
    var observedProps = {
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
            case 'paused': {
                if (!loaded) {
                    return null;
                }

                return !!videoElement.paused;
            }
            case 'time': {
                if (!loaded || videoElement.currentTime === null || !isFinite(videoElement.currentTime)) {
                    return null;
                }

                return Math.floor(videoElement.currentTime * 1000);
            }
            case 'duration': {
                if (!loaded || videoElement.duration === null || !isFinite(videoElement.duration)) {
                    return null;
                }

                return Math.floor(videoElement.duration * 1000);
            }
            case 'buffering': {
                if (!loaded) {
                    return null;
                }

                return videoElement.readyState < videoElement.HAVE_FUTURE_DATA;
            }
            case 'buffered': {
                if (!loaded) {
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
        var videoError;
        switch (videoElement.error.code) {
            case 1: {
                videoError = ERROR.HTML_VIDEO.MEDIA_ERR_ABORTED;
                break;
            }
            case 2: {
                videoError = ERROR.HTML_VIDEO.MEDIA_ERR_NETWORK;
                break;
            }
            case 3: {
                videoError = ERROR.HTML_VIDEO.MEDIA_ERR_DECODE;
                break;
            }
            case 4: {
                videoError = ERROR.HTML_VIDEO.MEDIA_ERR_SRC_NOT_SUPPORTED;
                break;
            }
            default: {
                videoError = ERROR.UNKNOWN_ERROR;
            }
        }
        onError(Object.assign({}, videoError, {
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
                if (loaded) {
                    propValue ? videoElement.pause() : videoElement.play();
                }

                break;
            }
            case 'time': {
                if (loaded && propValue !== null && isFinite(propValue)) {
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
                    videoElement.autoplay = typeof commandArgs.autoplay === 'boolean' ? commandArgs.autoplay : true;
                    videoElement.currentTime = commandArgs.time !== null && isFinite(commandArgs.time) ? parseInt(commandArgs.time, 10) / 1000 : 0;
                    if (commandArgs.stream.url.endsWith('.m3u8') && Hls.isSupported()) {
                        hls = new Hls();
                        hls.loadSource(commandArgs.stream.url);
                        hls.attachMedia(videoElement);
                    } else {
                        videoElement.src = commandArgs.stream.url;
                    }

                    loaded = true;
                    onPropChanged('paused');
                    onPropChanged('time');
                    onPropChanged('duration');
                    onPropChanged('buffering');
                    onPropChanged('buffered');
                } else {
                    onError(Object.assign({}, ERROR.UNSUPPORTED_STREAM, {
                        critical: true,
                        stream: commandArgs && commandArgs.stream ? commandArgs.stream : null
                    }));
                }

                break;
            }
            case 'unload': {
                loaded = false;
                if (hls !== null) {
                    hls.destroy();
                    hls = null;
                }

                videoElement.removeAttribute('src');
                videoElement.load();
                videoElement.currentTime = 0;
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
                events.on('error', function() { });
                videoElement.onerror = null;
                videoElement.onended = null;
                videoElement.onpause = null;
                videoElement.onplay = null;
                videoElement.ontimeupdate = null;
                videoElement.ondurationchange = null;
                videoElement.onwaiting = null;
                videoElement.onplaying = null;
                videoElement.oncanplay = null;
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

HTMLVideo.canPlayStream = function(stream) {
    if (!stream || typeof stream.url !== 'string') {
        return Promise.resolve(false);
    }

    if (stream.url.endsWith('.m3u8') && Hls.isSupported()) {
        return Promise.resolve(true);
    }

    return fetch(stream.url, { method: 'HEAD' })
        .then(function(resp) {
            var video = document.createElement('video');
            var type = resp.headers.get('content-type');
            return !!video.canPlayType(type);
        })
        .catch(function() {
            return false;
        });
};

HTMLVideo.manifest = {
    name: 'HTMLVideo',
    props: ['paused', 'time', 'duration', 'buffering', 'buffered', 'volume', 'muted'],
    events: ['propChanged', 'propValue', 'ended', 'error']
};

module.exports = HTMLVideo;
