var EventEmitter = require('eventemitter3');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var Color = require('color');
var ERROR = require('../error');

function TitanVideo(options) {
    options = options || {};

    var containerElement = options.containerElement;
    if (!(containerElement instanceof HTMLElement)) {
        throw new Error('Container element required to be instance of HTMLElement');
    }

    var styleElement = document.createElement('style');
    containerElement.appendChild(styleElement);
    styleElement.sheet.insertRule('video::cue { font-size: 4vmin; color: rgb(255, 255, 255); background-color: rgba(0, 0, 0, 0); text-shadow: rgb(34, 34, 34) 1px 1px 0.1em; }');
    var videoElement = document.createElement('video');
    videoElement.style.width = '100%';
    videoElement.style.height = '100%';
    videoElement.style.backgroundColor = 'black';
    videoElement.controls = false;
    videoElement.playsInline = true;
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
        onPropChanged('time');
        onPropChanged('buffering');
        onPropChanged('buffered');
    };
    videoElement.onseeked = function() {
        onPropChanged('time');
        onPropChanged('buffering');
        onPropChanged('buffered');
    };
    videoElement.onstalled = function() {
        onPropChanged('buffering');
        onPropChanged('buffered');
    };
    videoElement.onplaying = function() {
        onPropChanged('time');
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
    videoElement.onloadedmetadata = function() {
        onPropChanged('loaded');
    };
    videoElement.onloadeddata = function() {
        onPropChanged('buffering');
        onPropChanged('buffered');
    };
    videoElement.onvolumechange = function() {
        onPropChanged('volume');
        onPropChanged('muted');
    };
    videoElement.onratechange = function() {
        onPropChanged('playbackSpeed');
    };
    videoElement.textTracks.onchange = function() {
        onPropChanged('subtitlesTracks');
        onPropChanged('selectedSubtitlesTrackId');
        onCueChange();
        Array.from(videoElement.textTracks).forEach(function(track) {
            track.oncuechange = onCueChange;
        });
    };
    containerElement.appendChild(videoElement);

    var events = new EventEmitter();
    var destroyed = false;
    var stream = null;
    var subtitlesOffset = 0;
    var observedProps = {
        stream: false,
        loaded: false,
        paused: false,
        time: false,
        duration: false,
        buffering: false,
        buffered: false,
        subtitlesTracks: false,
        selectedSubtitlesTrackId: false,
        subtitlesOffset: false,
        subtitlesSize: false,
        subtitlesTextColor: false,
        subtitlesBackgroundColor: false,
        subtitlesOutlineColor: false,
        audioTracks: false,
        selectedAudioTrackId: false,
        volume: false,
        muted: false,
        playbackSpeed: false
    };

    function getProp(propName) {
        switch (propName) {
            case 'stream': {
                return stream;
            }
            case 'loaded': {
                if (stream === null) {
                    return null;
                }

                return videoElement.readyState >= videoElement.HAVE_METADATA;
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
            case 'subtitlesTracks': {
                if (stream === null) {
                    return [];
                }

                if (!videoElement.textTracks || !Array.from(videoElement.textTracks).length) {
                    return [];
                }

                return Array.from(videoElement.textTracks)
                    .filter(function(track) {
                        return track.kind === 'subtitles'
                    })
                    .map(function(track, index) {
                        return Object.freeze({
                            id: 'EMBEDDED_' + String(index),
                            lang: track.language,
                            label: track.label || track.language,
                            origin: 'EMBEDDED',
                            embedded: true
                        });
                    });
            }
            case 'selectedSubtitlesTrackId': {
                if (stream === null) {
                    return null;
                }

                if (!videoElement.textTracks || !Array.from(videoElement.textTracks).length) {
                    return null;
                }

                return Array.from(videoElement.textTracks)
                    .reduce(function(result, track, index) {
                        if (result === null && track.mode === 'showing') {
                            return 'EMBEDDED_' + String(index);
                        }

                        return result;
                    }, null);
            }
            case 'subtitlesOffset': {
                if (destroyed) {
                    return null;
                }

                return subtitlesOffset;
            }
            case 'subtitlesSize': {
                if (destroyed) {
                    return null;
                }

                return parseInt(styleElement.sheet.cssRules[0].style.fontSize, 10) * 25;
            }
            case 'subtitlesTextColor': {
                if (destroyed) {
                    return null;
                }

                return styleElement.sheet.cssRules[0].style.color;
            }
            case 'subtitlesBackgroundColor': {
                if (destroyed) {
                    return null;
                }

                return styleElement.sheet.cssRules[0].style.backgroundColor;
            }
            case 'subtitlesOutlineColor': {
                if (destroyed) {
                    return null;
                }

                return styleElement.sheet.cssRules[0].style.textShadow.slice(0, styleElement.sheet.cssRules[0].style.textShadow.indexOf(')') + 1);
            }
            case 'audioTracks': {
                if (stream === null) {
                    return [];
                }

                if (!videoElement.audioTracks || !Array.from(videoElement.audioTracks).length) {
                    return [];
                }

                return Array.from(videoElement.audioTracks)
                    .map(function(track, index) {
                        return Object.freeze({
                            id: 'EMBEDDED_' + String(index),
                            lang: track.language,
                            label: track.label || track.language,
                            origin: 'EMBEDDED',
                            embedded: true
                        });
                    });
            }
            case 'selectedAudioTrackId': {

                if (stream === null) {
                    return null;
                }

                if (!videoElement.audioTracks || !Array.from(videoElement.audioTracks).length) {
                    return null;
                }

                return Array.from(videoElement.audioTracks)
                    .reduce(function(result, track, index) {
                        if (result === null && track.enabled) {
                            return 'EMBEDDED_' + String(index);
                        }

                        return result;
                    }, null);
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
            case 'playbackSpeed': {
                if (destroyed || videoElement.playbackRate === null || !isFinite(videoElement.playbackRate)) {
                    return null;
                }

                return videoElement.playbackRate;
            }
            default: {
                return null;
            }
        }
    }
    function onCueChange() {
        Array.from(videoElement.textTracks).forEach(function(track) {
            Array.from(track.cues || []).forEach(function(cue) {
                cue.snapToLines = false;
                cue.line = 100 - subtitlesOffset;
            });
        });
    }
    function onVideoError() {
        if (destroyed) {
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
                    onPropChanged('paused');
                }

                break;
            }
            case 'time': {
                if (stream !== null && propValue !== null && isFinite(propValue)) {
                    videoElement.currentTime = parseInt(propValue, 10) / 1000;
                    onPropChanged('time');
                }

                break;
            }
            case 'selectedSubtitlesTrackId': {
                if (stream !== null) {
                    Array.from(videoElement.textTracks)
                        .forEach(function(track, index) {
                            track.mode = 'EMBEDDED_' + String(index) === propValue ? 'showing' : 'disabled';
                        });
                    var selectedSubtitlesTrack = getProp('subtitlesTracks')
                        .find(function(track) {
                            return track.id === propValue;
                        });
                    if (selectedSubtitlesTrack) {
                        onPropChanged('selectedSubtitlesTrackId');
                        events.emit('subtitlesTrackLoaded', selectedSubtitlesTrack);
                    }
                }

                break;
            }
            case 'subtitlesOffset': {
                if (propValue !== null && isFinite(propValue)) {
                    subtitlesOffset = Math.max(0, Math.min(100, parseInt(propValue, 10)));
                    onCueChange();
                    onPropChanged('subtitlesOffset');
                }

                break;
            }
            case 'subtitlesSize': {
                if (propValue !== null && isFinite(propValue)) {
                    styleElement.sheet.cssRules[0].style.fontSize = Math.floor(Math.max(0, parseInt(propValue, 10)) / 25) + 'vmin';
                    onPropChanged('subtitlesSize');
                }

                break;
            }
            case 'subtitlesTextColor': {
                if (typeof propValue === 'string') {
                    try {
                        styleElement.sheet.cssRules[0].style.color = Color(propValue).rgb().string();
                    } catch (error) {
                        // eslint-disable-next-line no-console
                        console.error('TitanVideo', error);
                    }

                    onPropChanged('subtitlesTextColor');
                }

                break;
            }
            case 'subtitlesBackgroundColor': {
                if (typeof propValue === 'string') {
                    try {
                        styleElement.sheet.cssRules[0].style.backgroundColor = Color(propValue).rgb().string();
                    } catch (error) {
                        // eslint-disable-next-line no-console
                        console.error('TitanVideo', error);
                    }

                    onPropChanged('subtitlesBackgroundColor');
                }

                break;
            }
            case 'subtitlesOutlineColor': {
                if (typeof propValue === 'string') {
                    try {
                        styleElement.sheet.cssRules[0].style.textShadow = Color(propValue).rgb().string() + ' 1px 1px 0.1em';
                    } catch (error) {
                        // eslint-disable-next-line no-console
                        console.error('TitanVideo', error);
                    }

                    onPropChanged('subtitlesOutlineColor');
                }

                break;
            }
            case 'selectedAudioTrackId': {
                if (stream !== null) {
                    for (var index = 0; index < videoElement.audioTracks.length; index++) {
                        videoElement.audioTracks[i].enabled = !!('EMBEDDED_' + String(index) === propValue)
                    }
                }

                break;
            }
            case 'volume': {
                if (propValue !== null && isFinite(propValue)) {
                    videoElement.muted = false;
                    videoElement.volume = Math.max(0, Math.min(100, parseInt(propValue, 10))) / 100;
                    onPropChanged('muted');
                    onPropChanged('volume');
                }

                break;
            }
            case 'muted': {
                videoElement.muted = !!propValue;
                onPropChanged('muted');
                break;
            }
            case 'playbackSpeed': {
                if (propValue !== null && isFinite(propValue)) {
                    videoElement.playbackRate = parseFloat(propValue);
                    onPropChanged('playbackSpeed');
                }

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
                    onPropChanged('loaded');
                    videoElement.autoplay = typeof commandArgs.autoplay === 'boolean' ? commandArgs.autoplay : true;
                    videoElement.currentTime = commandArgs.time !== null && isFinite(commandArgs.time) ? parseInt(commandArgs.time, 10) / 1000 : 0;
                    onPropChanged('paused');
                    onPropChanged('time');
                    onPropChanged('duration');
                    onPropChanged('buffering');
                    onPropChanged('buffered');
                    onPropChanged('subtitlesTracks');
                    onPropChanged('selectedSubtitlesTrackId');
                    onPropChanged('audioTracks');
                    onPropChanged('selectedAudioTrackId');
                    videoElement.src = stream.url;
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
                Array.from(videoElement.textTracks).forEach(function(track) {
                    track.oncuechange = null;
                });
                videoElement.removeAttribute('src');
                videoElement.load();
                videoElement.currentTime = 0;
                onPropChanged('stream');
                onPropChanged('loaded');
                onPropChanged('paused');
                onPropChanged('time');
                onPropChanged('duration');
                onPropChanged('buffering');
                onPropChanged('buffered');
                onPropChanged('subtitlesTracks');
                onPropChanged('selectedSubtitlesTrackId');
                onPropChanged('audioTracks');
                onPropChanged('selectedAudioTrackId');
                break;
            }
            case 'destroy': {
                command('unload');
                destroyed = true;
                onPropChanged('subtitlesOffset');
                onPropChanged('subtitlesSize');
                onPropChanged('subtitlesTextColor');
                onPropChanged('subtitlesBackgroundColor');
                onPropChanged('subtitlesOutlineColor');
                onPropChanged('volume');
                onPropChanged('muted');
                onPropChanged('playbackSpeed');
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
                videoElement.onratechange = null;
                videoElement.textTracks.onchange = null;
                containerElement.removeChild(videoElement);
                containerElement.removeChild(styleElement);
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

TitanVideo.canPlayStream = function(stream) {
    if (!stream) {
        return Promise.resolve(false);
    }

    return Promise.resolve(true);
};

TitanVideo.manifest = {
    name: 'TitanVideo',
    external: false,
    props: ['stream', 'loaded', 'paused', 'time', 'duration', 'buffering', 'buffered', 'audioTracks', 'selectedAudioTrackId', 'subtitlesTracks', 'selectedSubtitlesTrackId', 'subtitlesOffset', 'subtitlesSize', 'subtitlesTextColor', 'subtitlesBackgroundColor', 'subtitlesOutlineColor', 'volume', 'muted', 'playbackSpeed'],
    commands: ['load', 'unload', 'destroy'],
    events: ['propValue', 'propChanged', 'ended', 'error', 'subtitlesTrackLoaded', 'audioTrackLoaded']
};

module.exports = TitanVideo;
