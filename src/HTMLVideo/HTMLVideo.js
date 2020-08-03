var EventEmitter = require('events');
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
    };
    videoElement.ondurationchange = function() {
        onPropChanged('duration');
    };
    videoElement.onwaiting = function() {
        onPropChanged('buffering');
    };
    videoElement.onseeking = function() {
        onPropChanged('buffering');
    };
    videoElement.onseeked = function() {
        onPropChanged('buffering');
    };
    videoElement.onplaying = function() {
        onPropChanged('buffering');
    };
    videoElement.oncanplay = function() {
        onPropChanged('buffering');
    };
    videoElement.onloadeddata = function() {
        onPropChanged('buffering');
    };
    videoElement.onvolumechange = function() {
        onPropChanged('volume');
        onPropChanged('muted');
    };
    containerElement.appendChild(videoElement);

    var events = new EventEmitter();
    events.on('error', function() { });

    var destroyed = false;
    var loaded = false;
    var mediaSource = null;
    var observedProps = {
        paused: false,
        time: false,
        duration: false,
        buffering: false,
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
                    videoElement.currentTime = parseInt(propValue) / 1000;
                }

                break;
            }
            case 'volume': {
                if (propValue !== null && isFinite(propValue)) {
                    videoElement.muted = false;
                    videoElement.volume = Math.max(0, Math.min(100, parseInt(propValue))) / 100;
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
                    videoElement.currentTime = commandArgs.time !== null && isFinite(commandArgs.time) ? parseInt(commandArgs.time) / 1000 : 0;
                    if (commandArgs.stream.behaviorHints && commandArgs.stream.behaviorHints.fragmented && typeof commandArgs.stream.behaviorHints.mimeType === 'string') {
                        mediaSource = new MediaSource();
                        mediaSource.onsourceopen = function(event) {
                            if (mediaSource !== event.target) {
                                return;
                            }

                            var sourceBuffer = mediaSource.addSourceBuffer(commandArgs.stream.behaviorHints.mimeType);
                            if (typeof commandArgs.stream.behaviorHints.duration === 'string') {
                                mediaSource.duration = isFinite(commandArgs.stream.behaviorHints.duration) ? parseInt(commandArgs.stream.behaviorHints.duration) : Infinity;
                            }
                            fetch(commandArgs.stream.url)
                                .then(function(resp) {
                                    var reader = resp.body.getReader();
                                    function readFragment() {
                                        if (mediaSource !== event.target) {
                                            return;
                                        }

                                        return reader.read().then(function(result) {
                                            if (!result.done) {
                                                return new Promise(function(resolve) {
                                                    if (mediaSource !== event.target) {
                                                        resolve();
                                                        return;
                                                    }

                                                    sourceBuffer.onerror = function(error) {
                                                        onError(Object.assign({}, ERROR.HTML_VIDEO.MEDIA_ERR_FRAGMENTED, {
                                                            critical: true,
                                                            error: error
                                                        }));
                                                        resolve();
                                                    };
                                                    sourceBuffer.onupdateend = function() {
                                                        resolve(readFragment());
                                                    };

                                                    sourceBuffer.appendBuffer(result.value.buffer);
                                                });
                                            }
                                        });
                                    }
                                    return readFragment();
                                })
                                .catch(function(error) {
                                    if (mediaSource !== event.target) {
                                        return;
                                    }

                                    onError(Object.assign({}, ERROR.UNKNOWN_ERROR, {
                                        critical: true,
                                        error: error
                                    }));
                                });
                        };
                        videoElement.src = URL.createObjectURL(mediaSource);
                    } else {
                        videoElement.src = commandArgs.stream.url;
                    }
                    loaded = true;
                    onPropChanged('paused');
                    onPropChanged('time');
                    onPropChanged('duration');
                    onPropChanged('buffering');
                }

                break;
            }
            case 'unload': {
                loaded = false;
                if (mediaSource !== null) {
                    URL.revokeObjectURL(videoElement.src);
                    mediaSource.onsourceopen = null;
                    Array.from(mediaSource.sourceBuffers).forEach(function(sourceBuffer) {
                        sourceBuffer.onupdateend = null;
                    });
                    mediaSource = null;
                }
                videoElement.removeAttribute('src');
                videoElement.load();
                videoElement.currentTime = 0;
                onPropChanged('paused');
                onPropChanged('time');
                onPropChanged('duration');
                onPropChanged('buffering');
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

HTMLVideo.manifest = {
    name: 'HTMLVideo',
    props: ['paused', 'time', 'duration', 'buffering', 'volume', 'muted']
};

module.exports = HTMLVideo;
