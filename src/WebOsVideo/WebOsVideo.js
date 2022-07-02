var EventEmitter = require('eventemitter3');
var Hls = require('hls.js');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var Color = require('color');
var ERROR = require('../error');
var getContentType = require('./getContentType');
var HLS_CONFIG = require('./hlsConfig');

function luna(params, call, fail, method) {
    if (call) params.onSuccess = call || function() {};

    params.onFailure = function (result) {
        console.log('WebOS',(params.method || method) + " [fail][" + result.errorCode + "] " + result.errorText );

        if (fail) fail();
    };

    webOS.service.request(method || "luna://com.webos.media", params);
}

function foreground() {
//    console.log('device info', webOS.deviceInfo());
//    console.log('app id', webOS.fetchAppId());
//    console.log('app info', webOS.fetchAppInfo());
    console.log('foreground');
//     webOS.service.request("luna://com.webos.applicationManager/getForegroundAppInfo", {
// //        method: "getForegroundAppInfo",
//         parameters: {},
//         onSuccess: function (result) {
//             console.log("foreground 2", JSON.stringify(result));
//         },
//         onFailure: function (inError) {
//             console.log('foreground 3', inError);
//         }
//     });
    webOS.service.request("luna://com.webos.activityManager", {
        method: "getForegroundAppInfo",
        parameters: {},
        onSuccess: function (result) {
            console.log("foreground 2", JSON.stringify(result));
        },
        onFailure: function (inError) {
            console.log('foreground 3', inError);
        }
    });
}

function runWebOS(params){
    console.log('run web os', params);
    webOS.service.request("luna://com.webos.applicationManager", {
        method: "launch",
        parameters: { 
            "id": params.need, 
            "params": {
                "payload":[
                    {
                        "fullPath": params.url,
                        "artist":"",
                        "subtitle":"",
                        "dlnaInfo":{
                            "flagVal":4096,
                            "cleartextSize":"-1",
                            "contentLength":"-1",
                            "opVal":1,
                            "protocolInfo":"http-get:*:video/x-matroska:DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000",
                            "duration":0
                        },
                        "mediaType":"VIDEO",
                        "thumbnail":"",
                        "deviceType":"DMR",
                        "album":"",
                        "fileName": params.name,
                        "lastPlayPosition": params.position
                    }
                ]
            }
        },
        onSuccess: function () {
            console.log("The app is launched");
        },
        onFailure: function (inError) {
            console.log('Player', "Failed to launch the app ("+params.need+"): ", "[" + inError.errorCode + "]: " + inError.errorText);

            if(params.need == 'com.webos.app.photovideo'){
                params.need = 'com.webos.app.smartshare'

                runWebOS(params)
            }
            else if(params.need == 'com.webos.app.smartshare'){
                params.need = 'com.webos.app.mediadiscovery'

                runWebOS(params)
            }
        }
    });
}

function WebOsVideo(options) {
    foreground();
    options = options || {};
console.log('webos video 1');
    var containerElement = options.containerElement;
    if (!(containerElement instanceof HTMLElement)) {
        throw new Error('Container element required to be instance of HTMLElement');
    }

    var knownMediaId = false;

    var subSize = 75;

    var disabledSubs = false;

    var subscribed = false;

    var currentSubTrack = false;

    var currentAudioTrack = false;

    var textTracks = [];

    var audioTracks = [];

    var count_message = 0;

    var setSubs = function (info) {
        textTracks = [];
        console.log('sub tracks 1, nr of sub tracks: ', info.numSubtitleTracks);
        if (info.numSubtitleTracks) {
    
        console.log('sub tracks 2');

        try {
            console.log('got sub info', JSON.stringify(info.subtitleTrackInfo));
        } catch(e) {};
            for (var i = 0; i < info.subtitleTrackInfo.length; i++) {
                var textTrack = info.subtitleTrackInfo[i];
                textTrack.index = i;
                var textTrackLang = textTrack.language == '(null)' ? '' : textTrack.language;

                var textTrackId = 'EMBEDDED_' + String(textTrack.index);

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
                })
    
            }

        console.log('sub tracks all', textTracks);

            onPropChanged('subtitlesTracks');
            onPropChanged('selectedSubtitlesTrackId');

        }
    }
console.log('webos video 2');

    var setTracks = function (info) {
        audioTracks = [];
        console.log('audio tracks 1, nr of audio tracks: ', info.numAudioTracks);
        if (info.numAudioTracks) {
    
        console.log('audio tracks 2');

                try {
                    console.log('got audio info', JSON.stringify(info.audioTrackInfo));
                } catch(e) {};
            for (var i = 0; i < info.audioTrackInfo.length; i++) {
                var audioTrack = info.audioTrackInfo[i];
                audioTrack.index = i;
                var audioTrackId = 'EMBEDDED_' + String(audioTrack.index)
                if (!currentAudioTrack && !audioTracks.length) {
                    currentAudioTrack = audioTrackId;
                }
                var audioTrackLang = audioTrack.language == '(null)' ? '' : audioTrack.language;
                audioTracks.push({
                    id: audioTrackId,
                    lang: audioTrackLang,
                    label: audioTrackLang,
                    origin: 'EMBEDDED',
                    embedded: true,
                    mode: audioTrackId === currentAudioTrack ? 'showing' : 'disabled',
                })
            }
    console.log('audio tracks all', audioTracks);
            onPropChanged('audioTracks');
            onPropChanged('selectedAudioTrackId');

        }
    }

console.log('webos video 3');
    var subscribe = function (cb) {
        if (subscribed) return;
        subscribed = true
console.log('subscribing');
        luna({
            method: 'subscribe',
            parameters: { 
                'mediaId': knownMediaId,
                'subscribe': true
            }
        }, function (result) {
            if (result.sourceInfo) {
                try {
                    console.log('got source info', JSON.stringify(result.sourceInfo.programInfo[0]));
                } catch(e) {};
                var info = result.sourceInfo.programInfo[0];
    
                setSubs(info);
    
                setTracks(info);
 
                cb();    
//        }
//                unsubscribe(cb);
            }

            if ((result.error || {}).errorCode) {
                console.error('luna playback error', result.error)
                unsubscribe(cb);
//                unsubscribe();
//                onVideoError();
                return;
            }

            if ((result.unloadCompleted || {}).mediaId == knownMediaId && (result.unloadCompleted || {}).state) {
                // strange case where it just.. ends? without ever getting result.sourceInfo
//                onEnded();
                console.log('strange case of end');
//                unsubscribe(cb);
                return
            }

            if (result.bufferRange) {
                count_message++

                if (count_message == 30) {
                    unsubscribe(cb);
                }
            } else {
                console.log('WebOS', 'subscribe', JSON.stringify(result));
                count_message++

                if (count_message == 30) {
                    unsubscribe(cb);
                }
            }
        }, function(err) {
            console.log('luna error log 2');
            console.error(err);
        });
    }

    var unsubscribe = function (cb) {
        if (!subscribed) return;
        subscribed = false;
        // luna({
        //     method: 'unload',
        //     parameters: { 
        //         'mediaId': knownMediaId
        //     }
        // }, cb, cb);
        cb();
    }

    var toggleSubtitles = function (status) {
        if (!knownMediaId) return;

        disabledSubs = !status;
    
        luna({
            method: 'setSubtitleEnable',
            parameters: { 
                'mediaId': knownMediaId,
                'enable': status
            }
        });
    }

 console.log('webos video 4');
   var styleElement = document.createElement('style');
    containerElement.appendChild(styleElement);
    styleElement.sheet.insertRule('video::cue { font-size: 4vmin; color: rgb(255, 255, 255); background-color: rgba(0, 0, 0, 0); text-shadow: rgb(34, 34, 34) 1px 1px 0.1em; }');
    var videoElement = document.createElement('video');
    videoElement.style.width = '100%';
    videoElement.style.height = '100%';
    videoElement.style.backgroundColor = 'black';
//    videoElement.crossOrigin = 'anonymous';
    videoElement.controls = false;
    videoElement.onerror = function() {
        console.log('on error?');
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

console.log('webos video 5');
    var hls = null;
console.log('webos video 51');
    var events = new EventEmitter();
console.log('webos video 52');
    var destroyed = false;
console.log('webos video 53');
    var stream = null;
console.log('webos video 54');
    var startTime = null;
console.log('webos video 55');
    var subtitlesOffset = 0;
console.log('webos video 56');
    var observedProps = {
        stream: false,
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

console.log('webos video 57');
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
            case 'subtitlesTracks': {
                if (stream === null) {
                    return [];
                }

                if (hls === null) {
                    return textTracks;
                } else {
                    return Array.from(videoElement.textTracks)
                        .map(function(track, index) {
                            return Object.freeze({
                                id: 'EMBEDDED_' + String(index),
                                lang: track.language,
                                label: track.label,
                                origin: 'EMBEDDED',
                                embedded: true
                            });
                        });
                }
            }
            case 'selectedSubtitlesTrackId': {
                if (stream === null) {
                    return null;
                }

                if (hls === null) {
                    return currentSubTrack;
                } else {
                    return Array.from(videoElement.textTracks)
                        .reduce(function(result, track, index) {
                            if (result === null && track.mode === 'showing') {
                                return 'EMBEDDED_' + String(index);
                            }

                            return result;
                        }, null);
                }
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
                if (hls === null) {
                    return audioTracks;
                }

                if (!Array.isArray(hls.audioTracks)) {
                    return [];
                }

                return hls.audioTracks
                    .map(function(track) {
                        return Object.freeze({
                            id: 'EMBEDDED_' + String(track.id),
                            lang: typeof track.lang === 'string' && track.lang.length > 0 ?
                                track.lang
                                :
                                typeof track.name === 'string' && track.name.length > 0 ?
                                    track.name
                                    :
                                    String(track.id),
                            label: typeof track.name === 'string' && track.name.length > 0 ?
                                track.name
                                :
                                typeof track.lang === 'string' && track.lang.length > 0 ?
                                    track.lang
                                    :
                                    String(track.id),
                            origin: 'EMBEDDED',
                            embedded: true
                        });
                    });
            }
            case 'selectedAudioTrackId': {
                if (hls === null) {
                    return currentAudioTrack;
                } else {
                    if (hls === null || hls.audioTrack === null || !isFinite(hls.audioTrack) || hls.audioTrack === -1) {
                        return null;
                    }

                    return 'EMBEDDED_' + String(hls.audioTrack);
                }
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
console.log('webos video 6');
        if (destroyed) {
            return;
        }

console.log('webos video 7');
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
                runWebOS({
                    need: 'com.webos.app.photovideo',
                    url: stream.url,
                    name: 'Stremio',
                    position: -1,
                })
                break;
            }
            case 4: {
                error = ERROR.HTML_VIDEO.MEDIA_ERR_SRC_NOT_SUPPORTED;
                runWebOS({
                    need: 'com.webos.app.photovideo',
                    url: stream.url,
                    name: 'Stremio',
                    position: -1,
                })
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
                    } catch(e) {
                        console.log('webos video change time error');
                        console.error(e);
                    }
                }

                break;
            }
            case 'selectedSubtitlesTrackId': {
                if (stream !== null) {
                    if (hls === null) {
                        toggleSubtitles((propValue || '').indexOf('EMBEDDED_') === -1 ? false : true);
                        
                        console.log('WebOS', 'change subtitles for id: ', knownMediaId, ' index:', propValue);

                        if ((propValue || '').indexOf('EMBEDDED_') === 0) {
                            currentSubTrack = propValue;
                            var trackIndex = parseInt(propValue.replace('EMBEDDED_', ''));
                            setTimeout(function() {
                                luna({
                                    method: 'selectTrack',
                                    parameters: { 
                                        'type': 'text',
                                        'mediaId': knownMediaId,
                                        'index': trackIndex
                                    }
                                }, function() {
                                    console.log('changed subs track successfully');
                                    var selectedSubtitlesTrack = getProp('subtitlesTracks')
                                        .find(function(track) {
                                            return track.id === propValue;
                                        });
                                    textTracks = textTracks.map(function(track) {
                                        track.mode = track.id === currentSubTrack ? 'showing' : 'disabled'
                                        return track;
                                    })
                                    if (selectedSubtitlesTrack) {
                                        events.emit('subtitlesTrackLoaded', selectedSubtitlesTrack);
                                        onPropChanged('selectedSubtitlesTrackId');
                                    }
                                })
                            }, 500);
                        }
                    } else {
                        Array.from(videoElement.textTracks)
                            .forEach(function(track, index) {
                                track.mode = 'EMBEDDED_' + String(index) === propValue ? 'showing' : 'disabled';
                            });
                        var selectedSubtitlesTrack = getProp('subtitlesTracks')
                            .find(function(track) {
                                return track.id === propValue;
                            });
                        if (selectedSubtitlesTrack) {
                            events.emit('subtitlesTrackLoaded', selectedSubtitlesTrack);
                        }
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
                    subSize = size = Math.max(0, parseInt(propValue, 10));

                    var webOsVal = 0;

                    if (subSize < 100) {
                        webOsVal = 0;
                    } else if (subSize < 125) {
                        webOsVal = 1;
                    } else if (subSize < 150) {
                        webOsVal = 2;
                    } else if (subSize < 175) {
                        webOsVal = 3;
                    } else if (subSize < 200) {
                        webOsVal = 4;
                    } else {
                        webOsVal = 4;
                    }

                    webOS.service.request("luna://com.webos.media", {
                        fontSize: webOsVal,
                        onSuccess: function() {},
                        onFailure: function() {},
                    });

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
                        console.error('WebOsVideo', error);
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
                        console.error('WebOsVideo', error);
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
                        console.error('WebOsVideo', error);
                    }

                    onPropChanged('subtitlesOutlineColor');
                }

                break;
            }
            case 'selectedAudioTrackId': {
                if (hls === null) {
                    console.log('WebOS', 'change audio track for id: ', knownMediaId, ' index:', propValue);

                    if ((propValue || '').indexOf('EMBEDDED_') === 0) {
                        currentAudioTrack = propValue;
                        var trackIndex = parseInt(propValue.replace('EMBEDDED_', ''));
                        luna({
                            method: 'selectTrack',
                            parameters: { 
                                'type': 'audio',
                                'mediaId': knownMediaId,
                                'index': trackIndex
                            }
                        }, function() {
                            console.log('changed audio track successfully');
                            var selectedAudioTrack = getProp('audioTracks')
                                .find(function(track) {
                                    return track.id === propValue;
                                });

                            audioTracks = audioTracks.map(function(track) {
                                track.mode = track.id === currentAudioTrack ? 'showing' : 'disabled'
                                return track;
                            })

                            if (selectedAudioTrack) {
                                events.emit('audioTrackLoaded', selectedAudioTrack);
                                onPropChanged('selectedAudioTrackId');
                            }
                        })
                        if (videoElement.audioTracks) {
                            for (var i = 0; i < videoElement.audioTracks.length; i++) {
                                videoElement.audioTracks[i].enabled = false
                            }

                            if(videoElement.audioTracks[trackIndex]){
                                videoElement.audioTracks[trackIndex].enabled = true

                                console.log('WebOS', 'change audio two method:', trackIndex)
                            }
                        }

                    }
                } else {
                    var selecterdAudioTrack = getProp('audioTracks')
                        .find(function(track) {
                            return track.id === propValue;
                        });
                    hls.audioTrack = selecterdAudioTrack ? parseInt(selecterdAudioTrack.id.split('_').pop(), 10) : -1;
                    if (selecterdAudioTrack) {
                        events.emit('audioTrackLoaded', selecterdAudioTrack);
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
                    videoElement.playbackRate = parseFloat(propValue);
                }

                break;
            }
        }
    }
console.log('webos video 58');
    function command(commandName, commandArgs) {
console.log('webos video 8', commandName);
        switch (commandName) {
            case 'load': {
console.log('webos video 9');
//                command('unload');
console.log('webos video 10');
                if (commandArgs && commandArgs.stream && typeof commandArgs.stream.url === 'string') {
                    stream = commandArgs.stream;
                    startTime = commandArgs.time;
console.log('webos video 11');
                    onPropChanged('stream');
                    videoElement.autoplay = typeof commandArgs.autoplay === 'boolean' ? commandArgs.autoplay : true;
console.log('webos video 12');
                    onPropChanged('paused');
                    onPropChanged('time');
                    onPropChanged('duration');
                    onPropChanged('buffering');
                    onPropChanged('buffered');
                    onPropChanged('subtitlesTracks');
                    onPropChanged('selectedSubtitlesTrackId');
                    onPropChanged('audioTracks');
                    onPropChanged('selectedAudioTrackId');
console.log('webos video 13');
                    // function initMediaId(cb) {
                    //                 var count = 0;
                    //                 console.log('init media id');
                    //                 function retrieveMediaId() {
                    //                     console.log('pew');
                    //                     if (videoElement.mediaId) {
                    //                         knownMediaId = videoElement.mediaId;
                    //                         console.log('got media id: ', videoElement.mediaId);
                    //                         clearInterval(timer);
                    //                         subscribe(cb);
                    //                         return;
                    //                     }
                    //                     count++;
                    //                     if (count > 4) {
                    //                         console.log('failed to get media id');
                    //                         clearInterval(timer);
                    //                         cb();
                    //                     }
                    //                 }
                    //                 var timer = setInterval(retrieveMediaId, 300);
                    // }
                    // function somethingElse(cb) {
                    function initMediaId(cb) {
                        // luna({
                        //     method: '/getForegroundAppInfo',
                        //     parameters: {
                        //         'subscribe': true
                        //     }
                        // }, function (foregroundAppInfo) {
                        //     console.log('foregroundAppInfo', JSON.stringify(foregroundAppInfo));
                        //     console.log(foregroundAppInfo.windowId);
                        //     if (!foregroundAppInfo.windowId) return;
                            luna({
                                method: 'load',
                                parameters: { 
                                    'uri': stream.url,
                                    'type': 'media',
                                    'payload': {
                                        'option': {
                                            'appId': 'io.strem.tv',
                                            'windowId': '_Window_Id_1',
//                                            'windowId': foregroundAppInfo.windowId,
                                        }
                                    }
                                }
                            }, function (result) {
                                console.log('success load', JSON.stringify(result));
                                if ((result || {}).mediaId) {
                                    console.log('init media id 2');

                                    knownMediaId = result.mediaId;

                                    console.log('prior media id', videoElement.mediaId);

                                    videoElement.setAttribute('mediaId', knownMediaId);
                                    videoElement.setAttribute('id', knownMediaId);
                                    videoElement.mediaId = knownMediaId;

                                    luna({
                                        method: 'play',
                                        parameters: { 
                                            'mediaId': knownMediaId,
                                        }
                                    }, function (result) {
                                        console.log('play result', JSON.stringify(result))
                                        // setTimeout(function() {
                                        //     luna({
                                        //         method: 'getActivePipelines',
                                        //         parameters: { 
                                        //             'mediaId': knownMediaId,
                                        //         }
                                        //     }, function (result) {
                                        //         console.log('active pipelines result', JSON.stringify(result))
                                        //     }, function(err) {
                                        //         console.log('active pipelines error', JSON.stringify(err))
                                        //     });
                                        // }, 3000);
                                    }, function(err) {
                                        console.log('play error', JSON.stringify(err))
                                    });

                                    subscribe(cb);

                                    return;

                                    var count = 0;
                                    console.log('init media id');
                                    function retrieveMediaId() {
                                        console.log('pew');
                                        if (videoElement.mediaId) {
                                            knownMediaId = videoElement.mediaId;
                                            console.log('got media id: ', videoElement.mediaId);
                                            clearInterval(timer);
                                            subscribe(cb);
                                            return;
                                        }
                                        count++;
                                        if (count > 4) {
                                            console.log('failed to get media id');
                                            clearInterval(timer);
                                            cb();
                                        }
                                    }
                                    var timer = setInterval(retrieveMediaId, 300);
                                }
                            }, function(err) {
                                console.log('failed load', JSON.stringify(err));
                            })
                        // }, function(err) {
                        //     console.log('failed get app info', JSON.stringify(err));
                        // }, 'luna://com.webos.applicationManager');
                    }
                    function startVideo() {
                        console.log('startVideo');
//                        videoElement.src = stream.url;

                        // try {
                        //     videoElement.load();
                        // } catch(e) {
                        //     console.log('can\'t load video');
                        //     console.error(e);
                        // }

                        // try {
                        //     videoElement.play();
                        // } catch(e) {
                        //     console.log('can\'t start video');
                        //     console.error(e);
                        // }
                    }
console.log('webos video 14', stream.url);
//            var http = new XMLHttpRequest();
//            http.open('HEAD', stream.url);
//            http.onreadystatechange = function() {

//                if (this.readyState === this.DONE) {
//console.log('response url', this.responseURL);
//console.log('stream is', stream);
//                    if (this.responseURL)
//                        stream.url = this.responseURL;

                    console.log('stream url is: ', stream.url);
                    getContentType(stream)
                        .then(function(contentType) {
console.log('webos video 15');
//                            if (stream !== commandArgs.stream) {
//                                return;
//                            }
                            console.log('content was: ', contentType);
//                            contentType = 'video/x-matroska';
                            console.log('content type is: ', contentType);

// console.log('webos video 16');
//                             if (contentType === 'application/vnd.apple.mpegurl' && Hls.isSupported()) {
// console.log('webos video 17');
//                                 hls = new Hls(HLS_CONFIG);
//                                 hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, function() {
//                                     onPropChanged('audioTracks');
//                                     onPropChanged('selectedAudioTrackId');
//                                 });
//                                 hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, function() {
//                                     onPropChanged('audioTracks');
//                                     onPropChanged('selectedAudioTrackId');
//                                 });
//                                 hls.loadSource(stream.url);
//                                 hls.attachMedia(videoElement);
//                             } else {
console.log('webos video 18');
                                console.log('hello there');
//                                videoElement.src = stream.url;

                                // try {
                                //     videoElement.load();
                                // } catch(e) {
                                //     console.log('can\'t load video');
                                //     console.error(e);
                                // }

// var options = {};
// options.mediaTransportType = "URI";
// options.option = {};
// options.option.transmission = {};
// options.option.transmission.playTime = {};
// options.option.transmission.playTime.start = 30 * 1000;

// var mediaOption = encodeURI(JSON.stringify(options));

// var source = document.createElement("source");

// //var dataURL = "quot;"+stream.url;
// source.setAttribute('src', stream.url);

// console.log('src is', stream.url);
// console.log('type is', contentType+';mediaOption=' + mediaOption);

// source.setAttribute('type', contentType+';mediaOption=' + mediaOption);

// videoElement.appendChild(source)

// try {
//     videoElement.load();
// } catch(e) {
//     console.log('can\'t load video');
//     console.error(e);
// }

console.log('webos video 22');
                                initMediaId(startVideo);
//                            }
                        })
                        .catch(function() {
console.log('webos video 19');
                            if (stream !== commandArgs.stream) {
                                return;
                            }

console.log('webos video 20');
                            videoElement.src = stream.url;

console.log('webos video 21');
                            initMediaId(stream.url, startVideo);
                        });
                } else {
                    onError(Object.assign({}, ERROR.UNSUPPORTED_STREAM, {
                        critical: true,
                        stream: commandArgs ? commandArgs.stream : null
                    }));
                }
//            }
//        }
//        http.send();
                break;
            }
            case 'unload': {
//                return; // disable unload for tests
                stream = null;
                startTime = null;
                Array.from(videoElement.textTracks).forEach(function(track) {
                    track.oncuechange = null;
                });
                if (hls !== null) {
                    hls.removeAllListeners();
                    hls.detachMedia(videoElement);
                    hls.destroy();
                    hls = null;
                }
                videoElement.removeAttribute('src');
                videoElement.load();
//                try {
//                    videoElement.currentTime = 0;
//                } catch(e) {
//                    console.log('webos video unload error');
//                    console.error(e);
//                }
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

WebOsVideo.canPlayStream = function(stream) {
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

WebOsVideo.manifest = {
    name: 'WebOsVideo',
    external: false,
    props: ['stream', 'paused', 'time', 'duration', 'buffering', 'buffered', 'audioTracks', 'selectedAudioTrackId', 'subtitlesTracks', 'selectedSubtitlesTrackId', 'subtitlesOffset', 'subtitlesSize', 'subtitlesTextColor', 'subtitlesBackgroundColor', 'subtitlesOutlineColor', 'volume', 'muted', 'playbackSpeed'],
    commands: ['load', 'unload', 'destroy'],
    events: ['propValue', 'propChanged', 'ended', 'error', 'subtitlesTrackLoaded', 'audioTrackLoaded']
};

module.exports = WebOsVideo;