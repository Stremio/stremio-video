var EventEmitter = require('eventemitter3');
var Hls = require('hls.js');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var Color = require('color');
var ERROR = require('../error');
var getContentType = require('./getContentType');
var HLS_CONFIG = require('./hlsConfig');

function TizenVideo(options) {
    options = options || {};

    var isBuffering = true;
    var videoSpeed = 1;
    var currentSubTrack = null;
    var currentAudioTrack = null;

    var containerElement = options.containerElement;
    if (!(containerElement instanceof HTMLElement)) {
        throw new Error('Container element required to be instance of HTMLElement');
    }

    var size = 100;
    var offset = 0;
    var textColor = 'rgb(255, 255, 255)';
    var backgroundColor = 'rgba(0, 0, 0, 0)';
    var outlineColor = 'rgb(34, 34, 34)';

    var objElement = document.createElement('object');
    objElement.type = 'application/avplayer';
    objElement.style.width = '100%';
    objElement.style.height = '100%';
    objElement.style.backgroundColor = 'black';

    var lastSub;
    var disabledSubs = false;

    function refreshSubtitle() {
        if (lastSub) {
            var lastSubDurationDiff = lastSub.duration - (getProp('time') - lastSub.now);
            if (lastSubDurationDiff > 0) renderSubtitle(lastSubDurationDiff, lastSub.text);
        }
    }

    function renderSubtitle(duration, text) {
        if (disabledSubs) return;
        // we ignore custom delay here, it's not needed for embedded subs
        lastSub = { duration: duration, text, now: getProp('time') };
        if (subtitleTimeout) {
            clearTimeout(subtitleTimeout);
            subtitleTimeout = false;
        }

        while (subtitlesElement.hasChildNodes()) {
            subtitlesElement.removeChild(subtitlesElement.lastChild);
        }

        subtitlesElement.style.bottom = offset + '%';
        var cueNode = document.createElement('span');
        cueNode.innerHTML = text;
        cueNode.style.display = 'inline-block';
        cueNode.style.padding = '0.2em';
        cueNode.style.fontSize = Math.floor(size / 25) + 'vmin';
        cueNode.style.color = textColor;
        cueNode.style.backgroundColor = backgroundColor;
        cueNode.style.textShadow = '1px 1px 0.1em ' + outlineColor;

        subtitlesElement.appendChild(cueNode);
        subtitlesElement.appendChild(document.createElement('br'));

        if (duration) {
            subtitleTimeout = setTimeout(function() {
                while (subtitlesElement.hasChildNodes()) {
                    subtitlesElement.removeChild(subtitlesElement.lastChild);
                }
            }, parseInt(duration));
        }
    }

    var subtitleTimeout = false;
    var Listener = {
        onbufferingstart: function() {
            isBuffering = true;
            onPropChanged('buffering');
        },
        onbufferingprogress: function(percent) {
            isBuffering = true;
            onPropChanged('buffering');
        },
        onbufferingcomplete: function() {
            isBuffering = false;
            onPropChanged('buffering');
        },
        oncurrentplaytime: function(currentTime) {
            onPropChanged('time');
        },
        onevent: function(eventType, eventData) {
            console.log("event type error : " + eventType + ", data: " + eventData);
        },
        onerror: function(eventType) {
            console.log("event type error : " + eventType);
            onVideoError();
        },
        onsubtitlechange: function(duration, text, data3, data4) {
            renderSubtitle(duration, text);
        },
        ondrmevent: function(drmEvent, drmData) {
            console.log("DRM callback: " + drmEvent + ", data: " + drmData);
        },
        onstreamcompleted: function() {
            onEnded();
        }
    };
    webapis.avplay.setListener(Listener);

    containerElement.appendChild(objElement);

    var subtitlesElement = document.createElement('div');
    subtitlesElement.style.position = 'absolute';
    subtitlesElement.style.right = '0';
    subtitlesElement.style.bottom = '0';
    subtitlesElement.style.left = '0';
    subtitlesElement.style.zIndex = '1';
    subtitlesElement.style.textAlign = 'center';
    containerElement.style.position = 'relative';
    containerElement.style.zIndex = '0';
    containerElement.appendChild(subtitlesElement);

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
        // buffered: false,
        subtitlesTracks: false,
        selectedSubtitlesTrackId: false,
        subtitlesOffset: false,
        subtitlesSize: false,
        subtitlesTextColor: false,
        subtitlesBackgroundColor: false,
        subtitlesOutlineColor: false,
        audioTracks: false,
        selectedAudioTrackId: false,
        // volume: false,
        // muted: false,
        playbackSpeed: false
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

                return !!(webapis.avplay.getState() === "PAUSED");
            }
            case 'time': {
                var currentTime = webapis.avplay.getCurrentTime();
                if (stream === null || currentTime === null || !isFinite(currentTime)) {
                    return null;
                }

                return Math.floor(currentTime);
            }
            case 'duration': {
                var duration = webapis.avplay.getDuration();
                if (stream === null || duration === null || !isFinite(duration)) {
                    return null;
                }

                return Math.floor(duration);
            }
            case 'buffering': {
                if (stream === null) {
                    return null;
                }

                return isBuffering;
            }
            case 'subtitlesTracks': {
                if (stream === null) {
                    return [];
                }

                var totalTrackInfo = webapis.avplay.getTotalTrackInfo();
                var textTracks = [];

                for (var i=0; i < totalTrackInfo.length; i++) {
                    if (totalTrackInfo[i].type == 'TEXT') {
                        var textTrack = totalTrackInfo[i];
                        var textTrackId = 'EMBEDDED_' + String(textTrack.index)
                        if (!currentSubTrack && !textTracks.length) {
                            currentSubTrack = textTrackId;
                        }
                        var extra = {}
                        try {
                            extra = JSON.parse(textTrack.extra_info)
                        } catch(e) {}
                        var textTrackLang = (extra.track_lang || '').trim();
                        textTracks.push({
                            id: textTrackId,
                            lang: textTrackLang,
                            label: textTrackLang,
                            origin: 'EMBEDDED',
                            embedded: true,
                            mode: textTrackId === currentSubTrack ? 'showing' : 'disabled',
                        })
                    }
                }

                return textTracks;
            }
            case 'selectedSubtitlesTrackId': {
                if (stream === null) {
                    return null;
                }

                var currentTracks = webapis.avplay.getCurrentStreamInfo();
                var currentIndex;

                for (var i = 0; i < currentTracks.length; i++) {
                    if(currentTracks[i].type == 'TEXT'){
                         currentIndex = currentTracks[i].index;

                         break;
                    }
                }

                return currentIndex ? 'EMBEDDED_' + String(currentIndex) : null;

            }
            case 'subtitlesOffset': {
                if (destroyed) {
                    return null;
                }

                return offset;
            }
            case 'subtitlesSize': {
                if (destroyed) {
                    return null;
                }

                return size;
            }
            case 'subtitlesTextColor': {
                if (destroyed) {
                    return null;
                }

                return textColor;
            }
            case 'subtitlesBackgroundColor': {
                if (destroyed) {
                    return null;
                }

                return backgroundColor;
            }
            case 'subtitlesOutlineColor': {
                if (destroyed) {
                    return null;
                }

                return outlineColor;
            }
            case 'audioTracks': {
                if (stream === null) {
                    return [];
                }

                var totalTrackInfo = webapis.avplay.getTotalTrackInfo();
                var audioTracks = [];

                for (var i=0; i < totalTrackInfo.length; i++) {
                    if (totalTrackInfo[i].type == 'AUDIO') {
                        var audioTrack = totalTrackInfo[i];
                        var audioTrackId = 'EMBEDDED_' + String(audioTrack.index)
                        if (!currentAudioTrack && !audioTracks.length) {
                            currentAudioTrack = audioTrackId;
                        }
                        var extra = {}
                        try {
                            extra = JSON.parse(audioTrack.extra_info)
                        } catch(e) {}
                        var audioTrackLang = extra.language || '';
                        audioTracks.push({
                            id: audioTrackId,
                            lang: audioTrackLang,
                            label: audioTrackLang,
                            origin: 'EMBEDDED',
                            embedded: true,
                            mode: audioTrackId === currentAudioTrack ? 'showing' : 'disabled',
                        })
                    }
                }

                return audioTracks;
            }
            case 'selectedAudioTrackId': {
                if (stream === null) {
                    return null;
                }

                var currentTracks = webapis.avplay.getCurrentStreamInfo();
                var currentIndex;

                for (var i = 0; i < currentTracks.length; i++) {
                    if(currentTracks[i].type == 'AUDIO'){
                         currentIndex = currentTracks[i].index;

                         break;
                    }
                }

                return currentIndex ? 'EMBEDDED_' + String(currentIndex) : null;
            }
            // case 'volume': {
            //     if (destroyed || videoElement.volume === null || !isFinite(videoElement.volume)) {
            //         return null;
            //     }

            //     return Math.floor(videoElement.volume * 100);
            // }
            // case 'muted': {
            //     if (destroyed) {
            //         return null;
            //     }

            //     return !!videoElement.muted;
            // }
            case 'playbackSpeed': {
                if (destroyed || videoSpeed === null || !isFinite(videoSpeed)) {
                    return null;
                }

                return videoSpeed;
            }
            default: {
                return null;
            }
        }
    }
    function onVideoError() {
        if (destroyed) {
            return;
        }

        var error;
        error = ERROR.UNKNOWN_ERROR;
        onError(Object.assign({}, error, {
            critical: true,
            error: error
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
                    var willPause = !!propValue;
                    willPause ? webapis.avplay.pause() : webapis.avplay.play();
                    if (willPause) {
                        if (subtitleTimeout)
                            clearTimeout(subtitleTimeout);
                    } else {
                        refreshSubtitle();
                    }
                }

                setTimeout(function() {
                    onPropChanged('paused');
                })

                break;
            }
            case 'time': {
                if (stream !== null && propValue !== null && isFinite(propValue)) {
                    webapis.avplay.seekTo(parseInt(propValue, 10));
                    renderSubtitle(0,'');
                }

                break;
            }
            case 'selectedSubtitlesTrackId': {
                if (stream !== null) {
                    if ((currentSubTrack || '').indexOf('EMBEDDED_') === 0) {
                        if ((propValue || '').indexOf('EMBEDDED_') === -1) {
                            renderSubtitle(0,'');
                            disabledSubs = true;
                            return;
                        }
                        disabledSubs = false;
                        var totalTrackInfo = webapis.avplay.getTotalTrackInfo();
                        var textTracks = [];

                        currentSubTrack = propValue;

                        var selectedSubtitlesTrack = getProp('subtitlesTracks')
                            .find(function(track) {
                                return track.id === propValue;
                            });

                        webapis.avplay.setSelectTrack('TEXT', parseInt(currentSubTrack.replace('EMBEDDED_','')));

                        if (selectedSubtitlesTrack) {
                            setTimeout(function() {
                                events.emit('subtitlesTrackLoaded', selectedSubtitlesTrack);
                                onPropChanged('selectedSubtitlesTrackId');
                            }, 1000);
                        }
                    }
                }

                break;
            }
            case 'subtitlesOffset': {
                if (propValue !== null && isFinite(propValue)) {
                    offset = Math.max(0, Math.min(100, parseInt(propValue, 10)));
                    refreshSubtitle();
                    onPropChanged('subtitlesOffset');
                }

                break;
            }
            case 'subtitlesSize': {
                if (propValue !== null && isFinite(propValue)) {
                    size = Math.max(0, parseInt(propValue, 10));
                    refreshSubtitle();
                    onPropChanged('subtitlesSize');
                }

                break;
            }
            case 'subtitlesTextColor': {
                if (typeof propValue === 'string') {
                    try {
                        textColor = Color(propValue).rgb().string();
                    } catch (error) {
                        // eslint-disable-next-line no-console
                        console.error('Tizen player with HTML Subtitles', error);
                    }

                    refreshSubtitle();
                    onPropChanged('subtitlesTextColor');
                }

                break;
            }
            case 'subtitlesBackgroundColor': {
                if (typeof propValue === 'string') {
                    try {
                        backgroundColor = Color(propValue).rgb().string();
                    } catch (error) {
                        // eslint-disable-next-line no-console
                        console.error('Tizen player with HTML Subtitles', error);
                    }

                    refreshSubtitle();

                    onPropChanged('subtitlesBackgroundColor');
                }

                break;
            }
            case 'subtitlesOutlineColor': {
                if (typeof propValue === 'string') {
                    try {
                        outlineColor = Color(propValue).rgb().string();
                    } catch (error) {
                        // eslint-disable-next-line no-console
                        console.error('Tizen player with HTML Subtitles', error);
                    }

                    refreshSubtitle();

                    onPropChanged('subtitlesOutlineColor');
                }

                break;
            }
            case 'selectedAudioTrackId': {
                if (stream !== null) {

                    currentAudioTrack = propValue;

                    var selectedAudioTrack = getProp('audioTracks')
                        .find(function(track) {
                            return track.id === propValue;
                        });

                    webapis.avplay.setSelectTrack('AUDIO', parseInt(currentAudioTrack.replace('EMBEDDED_','')));

                    if (selectedAudioTrack) {
                        setTimeout(function() {
                            events.emit('audioTrackLoaded', selectedAudioTrack);
                            onPropChanged('selectedAudioTrackId');
                        }, 1000)
                    }
                }

                break;
            }
            // case 'volume': {
            //     if (propValue !== null && isFinite(propValue)) {
            //         videoElement.muted = false;
            //         videoElement.volume = Math.max(0, Math.min(100, parseInt(propValue, 10))) / 100;
            //     }

            //     break;
            // }
            // case 'muted': {
            //     videoElement.muted = !!propValue;
            //     break;
            // }
            case 'playbackSpeed': {
                if (propValue !== null && isFinite(propValue)) {
                    videoSpeed = parseFloat(propValue);
                    try {
                        webapis.avplay.setSpeed(videoSpeed);
                    } catch (e) {
                        console.log(e);
                    }
                    setTimeout(function() { onPropChanged('playbackSpeed') });
                }

                break;
            }
        }
    }
    function command(commandName, commandArgs) {
        switch (commandName) {
            case 'load': {
//                command('unload');
                if (commandArgs && commandArgs.stream && typeof commandArgs.stream.url === 'string') {
                    stream = commandArgs.stream;

                    if (stream !== commandArgs.stream) {
                        return;
                    }
                    onPropChanged('buffering');

                    webapis.avplay.open(stream.url);
                    webapis.avplay.setDisplayRect(0, 0, 1920, 1080); //call this method after open() - To be called in these states - "IDLE", "PAUSE"
                    webapis.avplay.seekTo(commandArgs.time !== null && isFinite(commandArgs.time) ? parseInt(commandArgs.time, 10) : 0);
                    webapis.avplay.prepare();
                    onPropChanged('duration');
                    webapis.avplay.play();

                    onPropChanged('stream');
                    onPropChanged('paused');
                    onPropChanged('time');
                    onPropChanged('duration');
                    onPropChanged('subtitlesTracks');
                    onPropChanged('selectedSubtitlesTrackId');
                    onPropChanged('audioTracks');
                    onPropChanged('selectedAudioTrackId');

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
                webapis.avplay.stop();
                onPropChanged('stream');
                onPropChanged('paused');
                onPropChanged('time');
                onPropChanged('duration');
                onPropChanged('buffering');
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
//                onPropChanged('volume');
//                onPropChanged('muted');
                onPropChanged('playbackSpeed');
//                events.removeAllListeners();
                containerElement.removeChild(objElement);
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

TizenVideo.canPlayStream = function(stream) {
    return Promise.resolve(true);

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

TizenVideo.manifest = {
    name: 'TizenVideo',
    external: false,
    props: ['stream', 'paused', 'time', 'duration', 'buffering', 'audioTracks', 'selectedAudioTrackId', 'subtitlesTracks', 'selectedSubtitlesTrackId', 'subtitlesOffset', 'subtitlesSize', 'subtitlesTextColor', 'subtitlesBackgroundColor', 'subtitlesOutlineColor', 'playbackSpeed'],
    commands: ['load', 'unload', 'destroy'],
    events: ['propValue', 'propChanged', 'ended', 'error', 'subtitlesTrackLoaded', 'audioTrackLoaded']
};

module.exports = TizenVideo;
