var EventEmitter = require('eventemitter3');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var Color = require('color');
var ERROR = require('../error');

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

    var promiseAudioTrackChange = false;

    var size = 100;
    var offset = 0;
    var textColor = 'rgb(255, 255, 255)';
    var backgroundColor = 'rgba(0, 0, 0, 0)';
    var outlineColor = 'rgb(34, 34, 34)';
    var subtitlesOpacity = 1;

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
        lastSub = {
            duration: duration,
            text: text,
            now: getProp('time'),
        };
        if (subtitleTimeout) {
            clearTimeout(subtitleTimeout);
            subtitleTimeout = false;
        }

        while (subtitlesElement.hasChildNodes()) {
            subtitlesElement.removeChild(subtitlesElement.lastChild);
        }

        subtitlesElement.style.bottom = offset + '%';
        subtitlesElement.style.opacity = subtitlesOpacity;

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
            }, parseInt(duration * videoSpeed));
        }
    }

    var subtitleTimeout = false;
    var Listener = {
        onbufferingstart: function() {
            isBuffering = true;
            onPropChanged('buffering');
        },
        onbufferingprogress: function() {
            isBuffering = true;
            onPropChanged('buffering');
        },
        onbufferingcomplete: function() {
            isBuffering = false;
            onPropChanged('buffering');
        },
        oncurrentplaytime: function() {
            onPropChanged('time');
        },
        onerror: function() {
            onVideoError();
        },
        onsubtitlechange: function(duration, text) {
            renderSubtitle(duration, text);
        },
        onstreamcompleted: function() {
            onEnded();
        }
    };
    window.webapis.avplay.setListener(Listener);

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

    var events = new EventEmitter();
    var destroyed = false;
    var stream = null;
    var observedProps = {
        stream: false,
        paused: false,
        time: false,
        duration: false,
        buffering: false,
        subtitlesTracks: false,
        selectedSubtitlesTrackId: false,
        subtitlesOffset: false,
        subtitlesSize: false,
        subtitlesTextColor: false,
        subtitlesBackgroundColor: false,
        subtitlesOutlineColor: false,
        subtitlesOpacity: false,
        audioTracks: false,
        selectedAudioTrackId: false,
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

                var isPaused = !!(window.webapis.avplay.getState() === 'PAUSED');

                if (!isPaused && promiseAudioTrackChange) {
                    window.webapis.avplay.setSelectTrack('AUDIO', parseInt(promiseAudioTrackChange.replace('EMBEDDED_', '')));
                    promiseAudioTrackChange = false;
                }

                return isPaused;
            }
            case 'time': {
                var currentTime = window.webapis.avplay.getCurrentTime();
                if (stream === null || currentTime === null || !isFinite(currentTime)) {
                    return null;
                }

                return Math.floor(currentTime);
            }
            case 'duration': {
                var duration = window.webapis.avplay.getDuration();
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

                var totalTrackInfo = window.webapis.avplay.getTotalTrackInfo();
                var textTracks = [];

                for (var i = 0; i < totalTrackInfo.length; i++) {
                    if (totalTrackInfo[i].type === 'TEXT') {
                        var textTrack = totalTrackInfo[i];
                        var textTrackId = 'EMBEDDED_' + String(textTrack.index);
                        if (!currentSubTrack && !textTracks.length) {
                            currentSubTrack = textTrackId;
                        }
                        var extra = {};
                        try {
                            extra = JSON.parse(textTrack.extra_info);
                        } catch(e) {}
                        var textTrackLang = typeof extra.track_lang === 'string' && extra.track_lang.length > 0 ? extra.track_lang.trim() : null;
                        textTracks.push({
                            id: textTrackId,
                            lang: textTrackLang,
                            label: textTrackLang,
                            origin: 'EMBEDDED',
                            embedded: true,
                            mode: !disabledSubs && textTrackId === currentSubTrack ? 'showing' : 'disabled',
                        });
                    }
                }

                return textTracks;
            }
            case 'selectedSubtitlesTrackId': {
                if (stream === null || disabledSubs) {
                    return null;
                }

                var currentTracks = window.webapis.avplay.getCurrentStreamInfo();
                var currentIndex;

                for (var i = 0; i < currentTracks.length; i++) {
                    if (currentTracks[i].type === 'TEXT') {
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
            case 'subtitlesOpacity': {
                if (destroyed) {
                    return null;
                }

                return subtitlesOpacity;
            }
            case 'audioTracks': {
                if (stream === null) {
                    return [];
                }

                var totalTrackInfo = window.webapis.avplay.getTotalTrackInfo();
                var audioTracks = [];

                for (var i = 0; i < totalTrackInfo.length; i++) {
                    if (totalTrackInfo[i].type === 'AUDIO') {
                        var audioTrack = totalTrackInfo[i];
                        var audioTrackId = 'EMBEDDED_' + String(audioTrack.index);
                        if (!currentAudioTrack && !audioTracks.length) {
                            currentAudioTrack = audioTrackId;
                        }
                        var extra = {};
                        try {
                            extra = JSON.parse(audioTrack.extra_info);
                        } catch(e) {}
                        var audioTrackLang = typeof extra.language === 'string' && extra.language.length > 0 ? extra.language : null;
                        audioTracks.push({
                            id: audioTrackId,
                            lang: audioTrackLang,
                            label: audioTrackLang,
                            origin: 'EMBEDDED',
                            embedded: true,
                            mode: audioTrackId === currentAudioTrack ? 'showing' : 'disabled',
                        });
                    }
                }

                return audioTracks;
            }
            case 'selectedAudioTrackId': {
                if (stream === null) {
                    return null;
                }

                if (promiseAudioTrackChange) {
                    return promiseAudioTrackChange;
                }

                var currentTracks = window.webapis.avplay.getCurrentStreamInfo();
                var currentIndex = false;

                for (var i = 0; i < currentTracks.length; i++) {
                    if (currentTracks[i].type === 'AUDIO') {
                        currentIndex = currentTracks[i].index;

                        break;
                    }
                }

                return currentIndex !== false ? 'EMBEDDED_' + String(currentIndex) : null;
            }
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
                    willPause ? window.webapis.avplay.pause() : window.webapis.avplay.play();
                    if (willPause) {
                        if (subtitleTimeout) {
                            clearTimeout(subtitleTimeout);
                        }
                    } else {
                        refreshSubtitle();
                    }
                }

                onPropChanged('paused');

                // the paused state is usually correct, but i have seen it not change on tizen 3
                // which causes all kinds of issues in the UI: (only happens with some videos)
                var lastKnownProp = getProp('paused');

                setTimeout(function() {
                    if (getProp('paused') !== lastKnownProp) {
                        onPropChanged('paused');
                    }
                }, 1000);

                break;
            }
            case 'time': {
                if (stream !== null && propValue !== null && isFinite(propValue)) {
                    window.webapis.avplay.seekTo(parseInt(propValue, 10));
                    renderSubtitle(1, '');
                    onPropChanged('time');
                }

                break;
            }
            case 'selectedSubtitlesTrackId': {
                if (stream !== null) {
                    if ((currentSubTrack || '').indexOf('EMBEDDED_') === 0) {
                        if ((propValue || '').indexOf('EMBEDDED_') === -1) {
                            renderSubtitle(1, '');
                            disabledSubs = true;
                            onPropChanged('selectedSubtitlesTrackId');
                            return;
                        }
                        disabledSubs = false;

                        currentSubTrack = propValue;

                        var selectedSubtitlesTrack = getProp('subtitlesTracks')
                            .find(function(track) {
                                return track.id === propValue;
                            });

                        window.webapis.avplay.setSelectTrack('TEXT', parseInt(currentSubTrack.replace('EMBEDDED_', '')));

                        if (selectedSubtitlesTrack) {
                            events.emit('subtitlesTrackLoaded', selectedSubtitlesTrack);
                            onPropChanged('selectedSubtitlesTrackId');
                        }
                    } else if (!propValue) {
                        renderSubtitle(1, '');
                        disabledSubs = true;
                        onPropChanged('selectedSubtitlesTrackId');
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
            case 'subtitlesOpacity': {
                if (typeof propValue === 'number') {
                    try {
                        subtitlesOpacity = Math.min(Math.max(propValue / 100, 0), 1);
                    } catch (error) {
                        // eslint-disable-next-line no-console
                        console.error('Tizen player with HTML Subtitles', error);
                    }

                    refreshSubtitle();

                    onPropChanged('subtitlesOpacity');
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

                    if (getProp('paused')) {
                        // issues before this logic:
                        // tizen 3 does not allow changing audio track when paused
                        // tizen 5 does, but it will only change getProp('selectedAudioTrackId') after playback starts

                        // will be changed on next play event, until then we will overwrite the result of getProp('selectedAudioTrackId')
                        promiseAudioTrackChange = propValue;
                        onPropChanged('selectedAudioTrackId');
                    } else {
                        window.webapis.avplay.setSelectTrack('AUDIO', parseInt(currentAudioTrack.replace('EMBEDDED_', '')));
                    }
                    if (selectedAudioTrack) {
                        events.emit('audioTrackLoaded', selectedAudioTrack);
                        onPropChanged('selectedAudioTrackId');
                    }
                }

                break;
            }
            case 'playbackSpeed': {
                if (propValue !== null && isFinite(propValue)) {
                    videoSpeed = parseFloat(propValue);

                    try {
                        window.webapis.avplay.setSpeed(videoSpeed);
                    } catch (e) {}

                    onPropChanged('playbackSpeed');
                }

                break;
            }
        }
    }
    function command(commandName, commandArgs) {
        switch (commandName) {
            case 'load': {
                if (commandArgs && commandArgs.stream && typeof commandArgs.stream.url === 'string') {
                    stream = commandArgs.stream;

                    if (stream !== commandArgs.stream) {
                        return;
                    }
                    onPropChanged('buffering');

                    window.webapis.avplay.open(stream.url);
                    window.webapis.avplay.setDisplayRect(0, 0, window.innerWidth, window.innerHeight);
                    window.webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
                    window.webapis.avplay.seekTo(commandArgs.time !== null && isFinite(commandArgs.time) ? parseInt(commandArgs.time, 10) : 0);
                    window.webapis.avplay.prepare();
                    onPropChanged('duration');
                    window.webapis.avplay.play();

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
                window.webapis.avplay.stop();
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
                onPropChanged('subtitlesOpacity');
                onPropChanged('playbackSpeed');
                events.removeAllListeners();
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

TizenVideo.canPlayStream = function() {
    return Promise.resolve(true);
};

TizenVideo.manifest = {
    name: 'TizenVideo',
    external: false,
    props: ['stream', 'paused', 'time', 'duration', 'buffering', 'audioTracks', 'selectedAudioTrackId', 'subtitlesTracks', 'selectedSubtitlesTrackId', 'subtitlesOffset', 'subtitlesSize', 'subtitlesTextColor', 'subtitlesBackgroundColor', 'subtitlesOutlineColor', 'subtitlesOpacity', 'playbackSpeed'],
    commands: ['load', 'unload', 'destroy'],
    events: ['propValue', 'propChanged', 'ended', 'error', 'subtitlesTrackLoaded', 'audioTrackLoaded']
};

module.exports = TizenVideo;
