var EventEmitter = require('eventemitter3');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var ERROR = require('../error');

function luna(params, call, fail, method) {
    if (call) params.onSuccess = call || function() {};

    params.onFailure = function (result) {
        // eslint-disable-next-line no-console
        console.log('WebOS', (params.method || method) + ' [fail][' + result.errorCode + '] ' + result.errorText );

        // eslint-disable-next-line no-console
        console.log('fail result', JSON.stringify(result));

        if (fail) fail(result);
    };

    window.webOS.service.request(method || 'luna://com.webos.media', params);
}

function launchVideoApp(params, success, failure) {
    window.webOS.service.request('luna://com.webos.applicationManager', {
        method: 'launch',
        parameters: {
            'id': params.id,
            'params': {
                'payload':[
                    {
                        'fullPath': params.url,
                        'artist':'',
                        'subtitle':'',
                        'dlnaInfo':{
                            'flagVal':4096,
                            'cleartextSize':'-1',
                            'contentLength':'-1',
                            'opVal':1,
                            'protocolInfo':'http-get:*:video/x-matroska:DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000',
                            'duration':0
                        },
                        'mediaType':'VIDEO',
                        'thumbnail':'',
                        'deviceType':'DMR',
                        'album':'',
                        'fileName': params.name,
                        'lastPlayPosition': params.position
                    }
                ]
            }
        },
        onSuccess: function () {
            success && success();
        },
        onFailure: function () {
            failure && failure(new Error('Failed to launch' + params.id));

            if (params.id === 'com.webos.app.photovideo') {
                params.id = 'com.webos.app.smartshare';
                launchVideoApp(params, success, failure);
            } else if(params.id === 'com.webos.app.smartshare') {
                params.id = 'com.webos.app.mediadiscovery';
                launchVideoApp(params, success, failure);
            }
        }
    });
}

var webOsColors = ['none', 'black', 'white', 'yellow', 'red', 'green', 'blue'];
var stremioColors = {
    // rgba
    'rgba(0, 0, 0, 0)': 'none',
    'rgba(0, 0, 0, 255)': 'black',
    'rgba(255, 255, 255, 255)': 'white',
    'rgba(255, 255, 0, 255)': 'yellow',
    'rgba(255, 0, 0, 255)': 'red',
    'rgba(0, 255, 0, 255)': 'green',
    'rgba(0, 0, 255, 255)': 'blue',
    // rgba case 2
    'rgba(0, 0, 0, 1)': 'black',
    'rgba(255, 255, 255, 1)': 'white',
    'rgba(255, 255, 0, 1)': 'yellow',
    'rgba(255, 0, 0, 1)': 'red',
    'rgba(0, 255, 0, 1)': 'green',
    'rgba(0, 0, 255, 1)': 'blue',
    // rgb
    'rgb(0, 0, 0)': 'black',
    'rgb(255, 255, 255)': 'white',
    'rgb(255, 255, 0)': 'yellow',
    'rgb(255, 0, 0)': 'red',
    'rgb(0, 255, 0)': 'green',
    'rgb(0, 0, 255)': 'blue',
    // 8-digit hex
    '#000000FF': 'black',
    '#FFFFFFFF': 'white',
    '#FFFF00FF': 'yellow',
    '#FF0000FF': 'red',
    '#00FF00FF': 'green',
    '#0000FFFF': 'blue',
    // 6-digit hex
    '#000000': 'black',
    '#FFFFFF': 'white',
    '#FFFF00': 'yellow',
    '#FF0000': 'red',
    '#00FF00': 'green',
    '#0000FF': 'blue'
};

function stremioSubOffsets(offset) {
    if (offset <= 10) {
        return -3;
    } else if (offset <= 20) {
        return -2;
    } else if (offset <= 30) {
        return -1;
    } else if (offset <= 40) {
        return 0;
    } else if (offset <= 50) {
        return 1;
    } else if (offset <= 60) {
        return 2;
    } else if (offset <= 70) {
        return 3;
    } else if (offset <= 90) {
        return 4;
    }
    return false;
}

function stremioSubSizes(size) {
    // there is also: 0 (tiny)
    // adding zero will break the logic
    if (size <= 75) {
        return 1;
    } else if (size <= 100) {
        return 2;
    } else if (size <= 150) {
        return 3;
    } else if (size <= 250) {
        return 4;
    }
    return false;
}

function WebOsVideo(options) {

    options = options || {};

    var containerElement = options.containerElement;
    if (!(containerElement instanceof HTMLElement)) {
        throw new Error('Container element required to be instance of HTMLElement');
    }

    var isLoaded = null;

    var knownMediaId = false;

    var gotSourceInfo = false;

    var subSize = 75;

    var disabledSubs = true;

    var subscribed = false;

    var currentSubTrack = null;

    var currentAudioTrack = null;

    var textTracks = [];

    var audioTracks = [];

    var count_message = 0;

    var mediaId = function() {
        return videoElement.mediaId || knownMediaId;
    };

    var subStyles = {
        color: 'white',
        font_size: 1,
        bg_color: 'none',
        position: -1,
        bg_opacity: 0,
        char_opacity: 255
    };

    var setSubs = function (info) {
        textTracks = [];
        if (info.numSubtitleTracks) {
            for (var i = 0; i < info.subtitleTrackInfo.length; i++) {
                var textTrack = info.subtitleTrackInfo[i];
                textTrack.index = i;
                var textTrackLang = textTrack.language === '(null)' ? null : textTrack.language;

                var textTrackId = 'EMBEDDED_' + textTrack.index;

                if (!currentSubTrack && !textTracks.length) {
                    currentSubTrack = textTrackId;
                }

                textTracks.push({
                    id: textTrackId,
                    lang: textTrackLang,
                    label: textTrackLang,
                    origin: 'EMBEDDED',
                    embedded: true,
                    mode: textTrackId === currentSubTrack ? 'showing' : 'disabled',
                });

            }
            onPropChanged('subtitlesTracks');
            onPropChanged('selectedSubtitlesTrackId');

        }
    };

    var setTracks = function (info) {
        audioTracks = [];
        if (info.numAudioTracks) {
            for (var i = 0; i < info.audioTrackInfo.length; i++) {
                var audioTrack = info.audioTrackInfo[i];
                audioTrack.index = i;
                var audioTrackId = 'EMBEDDED_' + audioTrack.index;
                if (!currentAudioTrack && !audioTracks.length) {
                    currentAudioTrack = audioTrackId;
                }
                var audioTrackLang = audioTrack.language === '(null)' ? null : audioTrack.language;
                audioTracks.push({
                    id: audioTrackId,
                    lang: audioTrackLang,
                    label: audioTrackLang,
                    origin: 'EMBEDDED',
                    embedded: true,
                    mode: audioTrackId === currentAudioTrack ? 'showing' : 'disabled',
                });
            }
            onPropChanged('audioTracks');
            onPropChanged('selectedAudioTrackId');

        }
    };

    var startOnce = true;

    var subscribeRetries = 0;

    var subscribe = function (cb) {
        if (subscribed) return;
        subscribed = true;
        var answered = false;
        setTimeout(function() {
            loadVideo();
        }, 0);
        luna({
            method: 'subscribe',
            parameters: {
                'mediaId': mediaId(),
                'subscribe': true
            }
        }, function (result) {
            // eslint-disable-next-line no-console
            console.log('subscribe result is', JSON.stringify(result));

            if ((result || {}).sourceInfo && !gotSourceInfo) {
                gotSourceInfo = true;

                if (((result.sourceInfo || {}).programInfo || [])[0]) {
                    var info = result.sourceInfo.programInfo[0];

                    setSubs(info);

                    setTracks(info);
                }

                if (!answered) {
                    answered = true;
                    unsubscribe(cb);
                }

                return;
            }

            if ((result.error || {}).errorCode) {

                // we consider this a warning as it is non-fatal

                // stream may still play as only some tracks could be unsupported
                // known response:
                // { errorCode: 200, errorText: "Audio Codec Not Supported", mediaId: "..." }

                // eslint-disable-next-line no-console
                console.log('luna subscribe warning');
                // eslint-disable-next-line no-console
                console.warn(result.error);
                // eslint-disable-next-line no-console
                console.log('luna subscribe warning code', (result.error || {}).errorCode);
            }

            if ((result || {}).bufferRange) {
                count_message++;

                if (count_message === 30) {
                    if (!gotSourceInfo && subscribeRetries < 5) {
                        // eslint-disable-next-line no-console
                        console.log('max bufferRange: waiting 0.2s and retrying to subscribe, count', subscribeRetries);
                        count_message = 0;
                        subscribed = false;
                        subscribeRetries++;
                        setTimeout(function() {
                            subscribe(cb);
                        }, 200);
                    } else if (!answered) {
                        answered = true;
                        unsubscribe(cb);
                    }
                }
            }
        }, function(err) {
            // eslint-disable-next-line no-console
            console.log('luna subscribe error');
            // eslint-disable-next-line no-console
            console.error(err);
            // eslint-disable-next-line no-console
            console.log('luna subscribe error message');
            // eslint-disable-next-line no-console
            console.log((err || {}).errorText);
            if (((err || {}).mediaId === '<invalid mediaId>' || !gotSourceInfo) && subscribeRetries < 5) {
                // eslint-disable-next-line no-console
                console.log('waiting 0.2s and retrying to subscribe, count', subscribeRetries);
                subscribed = false;
                subscribeRetries++;
                setTimeout(function() {
                    subscribe(cb);
                }, 200);
            } else {
                if (cb) {
                    cb();
                }
            }
        });
    };

    var loadVideo = function () {
        luna({
            method: 'load',
            parameters: {
                'mediaId': mediaId()
            }
        }, function (result) {
            // eslint-disable-next-line no-console
            console.log('luna load result', JSON.stringify(result || {}));
        }, function (err) {
            // eslint-disable-next-line no-console
            console.log('luna load error', JSON.stringify(err || {}));
        });
        if (cb) {
            cb();
        }
    };

    var unsubscribe = function (cb) {
        if (!subscribed) return;
        subscribed = false;
        luna({
            method: 'unload',
            parameters: {
                'mediaId': mediaId()
            }
        }, function (result) {
            // eslint-disable-next-line no-console
            console.log('luna unsubscribe result', JSON.stringify(result || {}));
        }, function (err) {
            // eslint-disable-next-line no-console
            console.log('luna unsubscribe error', JSON.stringify(err || {}));
        });
        if (cb) {
            cb();
        }
    };

    var toggleSubtitles = function (status) {
        if (!mediaId()) return;

        disabledSubs = !status;

        luna({
            method: 'setSubtitleEnable',
            parameters: {
                'mediaId': mediaId(),
                'enable': status
            }
        });
    };

    var styleElement = document.createElement('style');
    containerElement.appendChild(styleElement);
    styleElement.sheet.insertRule('video::cue { font-size: 4vmin; color: rgb(255, 255, 255); background-color: rgba(0, 0, 0, 0); text-shadow: rgb(34, 34, 34) 1px 1px 0.1em; }');
    var videoElement = document.createElement('video');
    videoElement.style.width = '100%';
    videoElement.style.height = '100%';
    videoElement.style.backgroundColor = 'black';
    // videoElement.crossOrigin = 'anonymous';
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
        if (!isLoaded) {
            isLoaded = true;
            onPropChanged('loaded');
        }
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
    videoElement.onloadedmetadata = function() {
        onPropChanged('buffering');
        onPropChanged('buffered');
        setProp('time', startTime);
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

    var lastSubColor = null;
    var lastSubBgColor = null;
    var lastPlaybackSpeed = 1;

    var events = new EventEmitter();
    var destroyed = false;
    var stream = null;
    var startTime = null;
    var subtitlesOffset = 0;
    var subtitlesOpacity = 100;
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
        subtitlesOpacity: false,
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
                return isLoaded;
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

                return textTracks;
            }
            case 'selectedSubtitlesTrackId': {
                if (stream === null || disabledSubs) {
                    return null;
                }

                return currentSubTrack;
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

                return subSize;
            }
            case 'subtitlesTextColor': {
                if (destroyed) {
                    return null;
                }

                return lastSubColor || 'rgb(255, 255, 255)';
            }
            case 'subtitlesBackgroundColor': {
                if (destroyed) {
                    return null;
                }

                return lastSubBgColor || 'rgba(0, 0, 0, 0)';
            }
            case 'subtitlesOpacity': {
                if (destroyed) {
                    return null;
                }

                return subtitlesOpacity || 100;
            }
            case 'audioTracks': {
                if (stream === null) {
                    return [];
                }

                return audioTracks;
            }
            case 'selectedAudioTrackId': {
                return currentAudioTrack;
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
                if (destroyed || lastPlaybackSpeed === null || !isFinite(lastPlaybackSpeed)) {
                    return null;
                }

                return lastPlaybackSpeed;
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
        switch ((videoElement.error || {}).code) {
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
                launchVideoApp({
                    id: 'com.webos.app.photovideo',
                    url: stream.url,
                    name: 'Stremio',
                    position: -1,
                }, null, function(e) {
                    // eslint-disable-next-line no-console
                    console.error(e);
                });
                break;
            }
            case 4: {
                error = ERROR.HTML_VIDEO.MEDIA_ERR_SRC_NOT_SUPPORTED;
                launchVideoApp({
                    id: 'com.webos.app.photovideo',
                    url: stream.url,
                    name: 'Stremio',
                    position: -1,
                }, null, function(e) {
                    // eslint-disable-next-line no-console
                    console.error(e);
                });
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
                if (stream !== null && videoElement.readyState >= videoElement.HAVE_METADATA && propValue !== null && isFinite(propValue)) {
                    try {
                        videoElement.currentTime = parseInt(propValue, 10) / 1000;
                        onPropChanged('time');
                    } catch(e) {
                        // console.log('webos video change time error');
                        // console.error(e);
                    }
                }

                break;
            }
            case 'selectedSubtitlesTrackId': {
                if (mediaId() && stream !== null) {
                    if ((propValue || '').indexOf('EMBEDDED_') === 0) {
                        toggleSubtitles(true);

                        subStyles.bg_opacity = subStyles.bg_color === 'none' ? 0 : 255;

                        [
                            'setSubtitleCharacterColor',
                            'setSubtitleBackgroundColor',
                            'setSubtitlePosition',
                            'setSubtitleFontSize',
                            'setSubtitleBackgroundOpacity',
                            'setSubtitleCharacterOpacity'
                        ].forEach(function(key) {
                            luna({
                                method: key,
                                parameters: {
                                    mediaId: mediaId(),
                                    charColor: subStyles.color,
                                    bgColor: subStyles.bg_color === 'none' ? 'black' : subStyles.bg_color,
                                    position: subStyles.position,
                                    fontSize: subStyles.font_size,
                                    bgOpacity: subStyles.bg_opacity,
                                    charOpacity: subStyles.char_opacity
                                }
                            });
                        });

                        // eslint-disable-next-line no-console
                        console.log('WebOS', 'change subtitles for id: ', mediaId(), ' index:', propValue);

                        currentSubTrack = propValue;
                        var trackIndex = parseInt(propValue.replace('EMBEDDED_', ''));
                        // eslint-disable-next-line no-console
                        console.log('set subs to track idx: ' + trackIndex);
                        setTimeout(function() {
                            var successCb = function() {
                                var selectedSubtitlesTrack = getProp('subtitlesTracks')
                                    .find(function(track) {
                                        return track.id === propValue;
                                    });
                                textTracks = textTracks.map(function(track) {
                                    track.mode = track.id === currentSubTrack ? 'showing' : 'disabled';
                                    return track;
                                });
                                if (selectedSubtitlesTrack) {
                                    events.emit('subtitlesTrackLoaded', selectedSubtitlesTrack);
                                    onPropChanged('selectedSubtitlesTrackId');
                                }
                            };
                            luna({
                                method: 'selectTrack',
                                parameters: {
                                    'type': 'text',
                                    'mediaId': mediaId(),
                                    'index': trackIndex
                                }
                            }, successCb, successCb);
                        }, 500);
                    }
                }

                if ((propValue || '').indexOf('EMBEDDED_') === -1) {
                    currentSubTrack = null;
                    onPropChanged('selectedSubtitlesTrackId');
                    toggleSubtitles(false);
                }

                break;
            }
            case 'subtitlesOffset': {
                if (propValue !== null && isFinite(propValue)) {
                    subtitlesOffset = propValue;
                    var nextOffset = stremioSubOffsets(Math.max(0, Math.min(100, parseInt(subtitlesOffset, 10))));
                    if (nextOffset === false) { // use default
                        nextOffset = -1;
                    }
                    subStyles.position = nextOffset;
                    if (mediaId()) {
                        luna({
                            method: 'setSubtitlePosition',
                            parameters: {
                                'mediaId': mediaId(),
                                'position': nextOffset,
                            }
                        });
                    }

                    onPropChanged('subtitlesOffset');
                }

                break;
            }
            case 'subtitlesSize': {
                if (propValue !== null && isFinite(propValue)) {
                    subSize = propValue;
                    var nextSubSize = stremioSubSizes(Math.max(0, parseInt(subSize, 10)));
                    if (nextSubSize === false) { // use default
                        nextSubSize = 1;
                    }
                    subStyles.font_size = nextSubSize;
                    if (mediaId()) {
                        luna({
                            method: 'setSubtitleFontSize',
                            parameters: {
                                'mediaId': mediaId(),
                                'fontSize': nextSubSize,
                            }
                        });
                    }

                    onPropChanged('subtitlesSize');
                }

                break;
            }
            case 'subtitlesTextColor': {
                if (typeof propValue === 'string') {
                    // we use setSubtitleCharacterColor instead of setSubtitleColor
                    // because it has the same color options as the sub background
                    var nextColor = 'white';
                    if (stremioColors[propValue] && webOsColors.indexOf(stremioColors[propValue]) > -1) {
                        nextColor = stremioColors[propValue];
                    }
                    subStyles.color = nextColor;
                    if (mediaId()) {
                        luna({
                            method: 'setSubtitleCharacterColor',
                            parameters: {
                                'mediaId': mediaId(),
                                'charColor': nextColor,
                            }
                        });
                    }
                    lastSubColor = propValue;
                    onPropChanged('subtitlesTextColor');
                }

                break;
            }
            case 'subtitlesBackgroundColor': {
                if (typeof propValue === 'string') {
                    if (stremioColors[propValue] && webOsColors.indexOf(stremioColors[propValue]) > -1) {
                        subStyles.bg_color = stremioColors[propValue];
                        if (mediaId()) {
                            luna({
                                method: 'setSubtitleBackgroundColor',
                                parameters: {
                                    'mediaId': mediaId(),
                                    'bgColor': stremioColors[propValue] === 'none' ? 'black' : stremioColors[propValue],
                                }
                            });
                            if (stremioColors[propValue] === 'none') {
                                luna({
                                    method: 'setSubtitleBackgroundOpacity',
                                    parameters: {
                                        'mediaId': mediaId(),
                                        'bgOpacity': 0,
                                    }
                                });
                            } else {
                                luna({
                                    method: 'setSubtitleBackgroundOpacity',
                                    parameters: {
                                        'mediaId': mediaId(),
                                        'bgOpacity': 255,
                                    }
                                });
                            }
                        }
                    }
                    lastSubBgColor = propValue;
                    onPropChanged('subtitlesBackgroundColor');
                }

                break;
            }
            case 'subtitlesOpacity': {
                if (typeof propValue === 'number') {
                    var nextSubOpacity = Math.floor(propValue / 100 * 255);
                    subStyles.char_opacity = nextSubOpacity;
                    if (mediaId()) {
                        luna({
                            method: 'setSubtitleCharacterOpacity',
                            parameters: {
                                'mediaId': mediaId(),
                                'charOpacity': nextSubOpacity,
                            }
                        });
                    }

                    subtitlesOpacity = propValue;
                    onPropChanged('subtitlesOpacity');
                }

                break;
            }
            case 'selectedAudioTrackId': {
                if ((propValue || '').indexOf('EMBEDDED_') === 0) {
                    currentAudioTrack = propValue;
                    var trackIndex = parseInt(propValue.replace('EMBEDDED_', ''));
                    if (mediaId()) {
                        luna({
                            method: 'selectTrack',
                            parameters: {
                                'type': 'audio',
                                'mediaId': mediaId(),
                                'index': trackIndex
                            }
                        }, function() {
                            var selectedAudioTrack = getProp('audioTracks')
                                .find(function(track) {
                                    return track.id === propValue;
                                });

                            audioTracks = audioTracks.map(function(track) {
                                track.mode = track.id === currentAudioTrack ? 'showing' : 'disabled';
                                return track;
                            });

                            if (selectedAudioTrack) {
                                events.emit('audioTrackLoaded', selectedAudioTrack);
                                onPropChanged('selectedAudioTrackId');
                            }
                        });
                    }
                    if (videoElement && videoElement.audioTracks) {
                        for (var i = 0; i < videoElement.audioTracks.length; i++) {
                            videoElement.audioTracks[i].enabled = false;
                        }

                        if(videoElement.audioTracks[trackIndex]) {
                            videoElement.audioTracks[trackIndex].enabled = true;
                        }
                    }

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
            case 'playbackSpeed': {
                if (propValue !== null && isFinite(propValue)) {
                    lastPlaybackSpeed = parseFloat(propValue);
                    if (mediaId()) {
                        luna({
                            method: 'setPlayRate',
                            parameters: {
                                'mediaId': mediaId(),
                                'playRate': lastPlaybackSpeed,
                                'audioOutput': true,
                            }
                        });
                    }
                    onPropChanged('playbackSpeed');
                }

                break;
            }
        }
    }
    function command(commandName, commandArgs) {
        switch (commandName) {
            case 'load': {
                // not sure about this
                // command('unload');
                if (commandArgs && commandArgs.stream && typeof commandArgs.stream.url === 'string') {
                    stream = commandArgs.stream;
                    startTime = commandArgs.time;

                    onPropChanged('stream');
                    videoElement.autoplay = typeof commandArgs.autoplay === 'boolean' ? commandArgs.autoplay : true;

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

                    var count = 0;

                    var initMediaId = function (cb) {
                        function retrieveMediaId() {
                            if (videoElement.mediaId) {
                                knownMediaId = videoElement.mediaId;
                                clearInterval(timer);

                                subscribe(cb);

                                return;
                            }
                            count++;
                            if (count > 4) {
                                // console.log('failed to get media id');
                                clearInterval(timer);
                                cb();
                            }
                        }
                        var timer = setInterval(retrieveMediaId, 300);
                    };

                    var startVideo = function () {
                        if (!startOnce) return;
                        startOnce = false;
                        // console.log('startVideo');
                        // not needed?
                        // videoElement.src = stream.url;

                        try {
                            videoElement.load();
                        } catch(e) {
                            // console.log('can\'t load video');
                            // console.error(e);
                        }

                        try {
                            // console.log('try play');
                            videoElement.play();
                        } catch(e) {
                            // console.log('can\'t start video');
                            // console.error(e);
                        }
                    };

                    videoElement.src = stream.url;

                    initMediaId(startVideo);
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
                startTime = null;
                Array.from(videoElement.textTracks).forEach(function(track) {
                    track.oncuechange = null;
                });
                videoElement.removeAttribute('src');
                videoElement.load();
                // not sure about this:
                // try {
                //     videoElement.currentTime = 0;
                // } catch(e) {
                //     console.log('webos video unload error');
                //     console.error(e);
                // }
                onPropChanged('stream');
                onPropChanged('paused');
                onPropChanged('time');
                onPropChanged('duration');
                onPropChanged('buffering');
                onPropChanged('buffered');
                onPropChanged('subtitlesTracks');
                onPropChanged('selectedSubtitlesTrackId');
                onPropChanged('audioTracks');
                onPropChanged('selectedAudioTrackId');
                // not sure about this:
                // unload(function() {});
                break;
            }
            case 'destroy': {
                command('unload');
                destroyed = true;
                onPropChanged('subtitlesOffset');
                onPropChanged('subtitlesSize');
                onPropChanged('subtitlesTextColor');
                onPropChanged('subtitlesBackgroundColor');
                onPropChanged('subtitlesOpacity');
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
                videoElement.onloadedmetadata = null;
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

WebOsVideo.canPlayStream = function() { // function(stream)
    return Promise.resolve(true);
};

WebOsVideo.manifest = {
    name: 'WebOsVideo',
    external: false,
    props: ['stream', 'loaded', 'paused', 'time', 'duration', 'buffering', 'buffered', 'audioTracks', 'selectedAudioTrackId', 'subtitlesTracks', 'selectedSubtitlesTrackId', 'subtitlesOffset', 'subtitlesSize', 'subtitlesTextColor', 'subtitlesBackgroundColor', 'subtitlesOpacity', 'volume', 'muted', 'playbackSpeed'],
    commands: ['load', 'unload', 'destroy'],
    events: ['propValue', 'propChanged', 'ended', 'error', 'subtitlesTrackLoaded', 'audioTrackLoaded']
};

module.exports = WebOsVideo;
