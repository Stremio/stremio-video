/* eslint-disable no-console */
var EventEmitter = require('eventemitter3');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var ERROR = require('../error');
var getTracksData = require('../tracksData');

/* ------------------------------------
 * Luna helper (robusto a permessi/assenza webOS)
 * ------------------------------------ */
function luna(params, call, fail, method) {
    params = params || {};
    if (call) params.onSuccess = call || function () {};

    params.onFailure = function (result) {
        try {
            console.log(
                'WebOS',
                (params.method || method) +
                    ' [fail][' +
                    (result && result.errorCode) +
                    '] ' +
                    (result && result.errorText)
            );
            console.log('fail result', JSON.stringify(result));
        } catch (_e) {}
        if (fail) fail(result);
    };

    try {
        if (
            window &&
            window.webOS &&
            window.webOS.service &&
            typeof window.webOS.service.request === 'function'
        ) {
            window.webOS.service.request(method || 'luna://com.webos.media', params);
        } else {
            console.warn('webOS service not available; skipping luna call:', params.method || method);
            if (fail) fail({ errorCode: -1, errorText: 'webOS.service.request not available' });
        }
    } catch (e) {
        console.warn('luna request threw:', e && e.message);
        if (fail) fail({ errorCode: -2, errorText: 'Exception calling webOS.service.request' });
    }
}

/* ------------------------------------
 * Colori sottotitoli: mapping Stremio -> WebOS
 * ------------------------------------ */
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

/* ------------------------------------
 * Mapping posizioni/sizes sottotitoli
 * ------------------------------------ */
function stremioSubOffsets(offset) {
    if (offset <= 0) {
        return -3;
    } else if (offset <= 5) {
        return -2;
    } else if (offset <= 10) {
        return 0;
    } else if (offset <= 15) {
        return 2;
    } else if (offset <= 20) {
        return 4;
    }
    return false;
}
function stremioSubSizes(size) {
    // c'è anche 0 (tiny)
    if (size <= 100) {
        return 1;
    } else if (size <= 125) {
        // non usato (step 50%)
        return 2;
    } else if (size <= 150) {
        return 3;
    } else if (size <= 200) {
        return 4;
    }
    return false;
}

/* ------------------------------------
 * Base capabilities (verranno adattate per istanza)
 * ------------------------------------ */
var baseDeviceCaps = {
    unsupportedAudio: ['DTS', 'TRUEHD'],
    unsupportedSubs: ['HDMV/PGS', 'VOBSUB']
};

var fetchedDeviceInfo = false;

/* ------------------------------------
 * Normalizzazione label codec (evita falsi negativi)
 * ------------------------------------ */
function normCodec(name) {
    var s = (name || '').toString().toUpperCase();
    if (!s) return '';
    if (s.indexOf('DTS') > -1) return 'DTS'; // include DTS, DTS-HD, DTS:X (gestito come famiglia)
    if (s.indexOf('TRUEHD') > -1) return 'TRUEHD'; // include TrueHD/Atmos
    if (s.indexOf('PGS') > -1) return 'HDMV/PGS';
    if (s.indexOf('VOBSUB') > -1) return 'VOBSUB';
    if (s.indexOf('AC-4') > -1 || s.indexOf('AC4') > -1) return 'AC4';
    if (s.indexOf('MPEG-H') > -1 || s.indexOf('MPEGH') > -1) return 'MPEG-H';
    return s;
}

/* ------------------------------------
 * Rilevazione capability: EDID + deviceInfo (model/year)
 * ------------------------------------ */
function retrieveDeviceInfo(deviceCaps) {
    if (fetchedDeviceInfo) return;

    // 1) EDID type (DTS / TRUEHD hint)
    try {
        window.webOS &&
            window.webOS.service &&
            window.webOS.service.request('luna://com.webos.service.config', {
                method: 'getConfigs',
                parameters: { configNames: ['tv.model.edidType'] },
                onSuccess: function (result) {
                    var edidType =
                        (((result || {}).configs || {})['tv.model.edidType'] || '').toLowerCase();
                    if (edidType) {
                        fetchedDeviceInfo = true;
                        if (edidType.indexOf('dts') > -1) {
                            deviceCaps.unsupportedAudio = deviceCaps.unsupportedAudio.filter(function (e) {
                                return e !== 'DTS';
                            });
                        }
                        if (edidType.indexOf('truehd') > -1) {
                            deviceCaps.unsupportedAudio = deviceCaps.unsupportedAudio.filter(function (e) {
                                return e !== 'TRUEHD';
                            });
                        }
                        if (edidType.indexOf('ac-4') > -1 || edidType.indexOf('ac4') > -1) {
                            deviceCaps.unsupportedAudio = deviceCaps.unsupportedAudio.filter(function (e) {
                                return e !== 'AC4';
                            });
                        }
                    }
                },
                onFailure: function (err) {
                    console.log('could not get deviceInfo (edidType)', err);
                }
            });
    } catch (_e) {
        console.log('EDID detection not available');
    }

    // 2) webOSTV.js deviceInfo: model/anno (best-effort)
    try {
        if (window.webOS && typeof window.webOS.deviceInfo === 'function') {
            window.webOS.deviceInfo(function (dev) {
                try {
                    var model = ((dev || {}).modelName || '').toUpperCase();
                    // Esempio euristico: modelli 2024 noti (C4/G4/QNED di fascia alta) -> sblocca DTS
                    if (/C4|G4|M4|QNED9|QNED99|QNED95/.test(model)) {
                        deviceCaps.unsupportedAudio = deviceCaps.unsupportedAudio.filter(function (e) {
                            return e !== 'DTS';
                        });
                    }
                } catch (_e) {}
            });
        }
    } catch (_e) {
        console.log('webOS.deviceInfo not available');
    }
}

/* ========================================================================== */

function WebOsVideo(options) {
    options = options || {};

    var containerElement = options.containerElement;
    if (!(containerElement instanceof HTMLElement)) {
        throw new Error('Container element required to be instance of HTMLElement');
    }

    // Opzione avanzata: abilita manualmente codec (edge-cases)
    var forceEnable = new Set(options.forceEnableCodecs || []);
    var deviceCaps = {
        unsupportedAudio: baseDeviceCaps.unsupportedAudio.filter(function (c) {
            return !forceEnable.has(c);
        }),
        unsupportedSubs: baseDeviceCaps.unsupportedSubs.filter(function (c) {
            return !forceEnable.has(c);
        })
    };

    var isLoaded = null;
    var subSize = 75;
    var disabledSubs = true;
    var currentSubTrack = false;
    var currentAudioTrack = false;
    var textTracks = [];
    var audioTracks = [];
    var _count_message = 0;

    var subStyles = {
        color: 'white',
        font_size: 1,
        bg_color: 'none',
        position: -1,
        bg_opacity: 0,
        char_opacity: 255
    };

    var toggleSubtitles = function (status) {
        if (!videoElement.mediaId) return;
        disabledSubs = !status;
        luna({
            method: 'setSubtitleEnable',
            parameters: {
                mediaId: videoElement.mediaId,
                enable: status
            }
        });
    };

    // Stile base ::cue (per track WebVTT browser, non overlay nativo)
    var styleElement = document.createElement('style');
    containerElement.appendChild(styleElement);
    try {
        styleElement.sheet.insertRule(
            'video::cue { font-size: 4vmin; color: rgb(255, 255, 255); background-color: rgba(0, 0, 0, 0); text-shadow: rgb(34, 34, 34) 1px 1px 0.1em; }'
        );
    } catch (_e) {}

    // Elemento video
    var videoElement = document.createElement('video');
    videoElement.style.width = '100%';
    videoElement.style.height = '100%';
    videoElement.style.backgroundColor = 'black';
    videoElement.controls = false;

    // Throttling per 'buffered' (riduce rumore eventi)
    var lastBufferedEmit = 0;
    var bufferedThrottleMs = 250;
    function emitBufferedThrottled() {
        var now = Date.now();
        if (now - lastBufferedEmit >= bufferedThrottleMs) {
            lastBufferedEmit = now;
            onPropChanged('buffered');
        }
    }

    // Handler eventi HTML5
    videoElement.onerror = function () {
        onVideoError();
    };
    videoElement.onended = function () {
        onEnded();
    };
    videoElement.onpause = function () {
        onPropChanged('paused');
    };
    videoElement.onplay = function () {
        onPropChanged('paused');
    };
    videoElement.ontimeupdate = function () {
        onPropChanged('time');
        emitBufferedThrottled();
    };
    videoElement.ondurationchange = function () {
        onPropChanged('duration');
    };
    videoElement.onwaiting = function () {
        onPropChanged('buffering');
        emitBufferedThrottled();
    };
    videoElement.onseeking = function () {
        onPropChanged('buffering');
        emitBufferedThrottled();
    };
    videoElement.onseeked = function () {
        onPropChanged('buffering');
        emitBufferedThrottled();
    };
    videoElement.onstalled = function () {
        onPropChanged('buffering');
        emitBufferedThrottled();
    };
    videoElement.onplaying = function () {
        onPropChanged('buffering');
        emitBufferedThrottled();
        if (!isLoaded) {
            isLoaded = true;
            onPropChanged('loaded');
        }
    };
    videoElement.oncanplay = function () {
        onPropChanged('buffering');
        emitBufferedThrottled();
    };
    // BUGFIX: usare oncanplaythrough (non 'canplaythrough')
    videoElement.oncanplaythrough = function () {
        onPropChanged('buffering');
        emitBufferedThrottled();
    };
    videoElement.onloadeddata = function () {
        onPropChanged('buffering');
        emitBufferedThrottled();
    };
    videoElement.onloadedmetadata = function () {
        onPropChanged('buffering');
        emitBufferedThrottled();
        setProp('time', startTime);
    };
    videoElement.onvolumechange = function () {
        onPropChanged('volume');
        onPropChanged('muted');
    };
    videoElement.onratechange = function () {
        onPropChanged('playbackSpeed');
    };

    if (videoElement.textTracks) {
        videoElement.textTracks.onchange = function () {
            onPropChanged('subtitlesTracks');
            onPropChanged('selectedSubtitlesTrackId');
            onCueChange();
            Array.from(videoElement.textTracks).forEach(function (track) {
                track.oncuechange = onCueChange;
            });
        };
    }
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

    var gotTraktData = false;
    var tracksData = { audio: [], subs: [] };

    function retrieveExtendedTracks() {
        if (!gotTraktData && stream !== null) {
            gotTraktData = true;
            getTracksData(stream.url, function (resp) {
                var nrSubs = 0;
                var nrAudio = 0;
                textTracks = [];
                audioTracks = [];
                if (resp) {
                    tracksData = resp;
                }
                if (((tracksData || {}).subs || []).length) {
                    tracksData.subs.forEach(function (track) {
                        var codec = normCodec(track.codec || '');
                        if (deviceCaps.unsupportedSubs.indexOf(codec) > -1) {
                            return;
                        }
                        var textTrackId = nrSubs;
                        nrSubs++;
                        if (!currentSubTrack && !textTracks.length) {
                            currentSubTrack = textTrackId;
                        }
                        textTracks.push({
                            id: 'EMBEDDED_' + textTrackId,
                            lang: track.lang || 'eng',
                            label: track.label || null,
                            origin: 'EMBEDDED',
                            embedded: true,
                            codec: codec || null,
                            mode: textTrackId === currentSubTrack ? 'showing' : 'disabled'
                        });
                    });
                    onPropChanged('subtitlesTracks');
                    onPropChanged('selectedSubtitlesTrackId');
                }
                if (((tracksData || {}).audio || []).length) {
                    tracksData.audio.forEach(function (track) {
                        var codec = normCodec(track.codec || '');
                        if (deviceCaps.unsupportedAudio.indexOf(codec) > -1) {
                            return;
                        }
                        var audioTrackId = nrAudio;
                        nrAudio++;
                        if (!currentAudioTrack && !audioTracks.length) {
                            currentAudioTrack = audioTrackId;
                        }
                        audioTracks.push({
                            id: 'EMBEDDED_' + audioTrackId,
                            lang: track.lang || 'eng',
                            label: track.label || null,
                            origin: 'EMBEDDED',
                            embedded: true,
                            codec: codec || null,
                            mode: audioTrackId === currentAudioTrack ? 'showing' : 'disabled'
                        });
                    });
                    currentAudioTrack = 'EMBEDDED_0';
                    onPropChanged('audioTracks');
                    onPropChanged('selectedAudioTrackId');
                }
            });
        }
    }

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
                if (
                    stream === null ||
                    videoElement.currentTime === null ||
                    !isFinite(videoElement.currentTime)
                ) {
                    return null;
                }
                return Math.floor(videoElement.currentTime * 1000);
            }
            case 'duration': {
                if (
                    stream === null ||
                    videoElement.duration === null ||
                    !isFinite(videoElement.duration)
                ) {
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
                var time =
                    videoElement.currentTime !== null && isFinite(videoElement.currentTime)
                        ? videoElement.currentTime
                        : 0;
                for (var i = 0; i < videoElement.buffered.length; i++) {
                    if (
                        videoElement.buffered.start(i) <= time &&
                        time <= videoElement.buffered.end(i)
                    ) {
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
                if (destroyed) return null;
                return subtitlesOffset;
            }
            case 'subtitlesSize': {
                if (destroyed) return null;
                return subSize;
            }
            case 'subtitlesTextColor': {
                if (destroyed) return null;
                return lastSubColor || 'rgb(255, 255, 255)';
            }
            case 'subtitlesBackgroundColor': {
                if (destroyed) return null;
                return lastSubBgColor || 'rgba(0, 0, 0, 0)';
            }
            case 'subtitlesOpacity': {
                if (destroyed) return null;
                return subtitlesOpacity || 100;
            }
            case 'audioTracks': {
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
        Array.from(videoElement.textTracks || []).forEach(function (track) {
            Array.from(track.cues || []).forEach(function (cue) {
                cue.snapToLines = false;
                cue.line = 100 - subtitlesOffset;
            });
        });
    }

    function onVideoError() {
        if (destroyed) return;
        var error;
        switch ((videoElement.error || {}).code) {
            case 1:
                error = ERROR.HTML_VIDEO.MEDIA_ERR_ABORTED;
                break;
            case 2:
                error = ERROR.HTML_VIDEO.MEDIA_ERR_NETWORK;
                break;
            case 3:
                error = ERROR.HTML_VIDEO.MEDIA_ERR_DECODE;
                break;
            case 4:
                error = ERROR.HTML_VIDEO.MEDIA_ERR_SRC_NOT_SUPPORTED;
                break;
            default:
                error = ERROR.UNKNOWN_ERROR;
        }
        onError(
            Object.assign({}, error, {
                critical: true,
                error: videoElement.error
            })
        );
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
        if (Object.prototype.hasOwnProperty.call(observedProps, propName)) {
            events.emit('propValue', propName, getProp(propName));
            observedProps[propName] = true;
        }
    }

    function setProp(propName, propValue) {
        switch (propName) {
            case 'paused': {
                if (stream !== null) {
                    if (propValue) {
                        videoElement.pause();
                    } else {
                        var p = videoElement.play();
                        if (p && typeof p.catch === 'function') p.catch(function () {});
                    }
                }
                break;
            }
            case 'time': {
                if (
                    stream !== null &&
                    videoElement.readyState >= videoElement.HAVE_METADATA &&
                    propValue !== null &&
                    isFinite(propValue)
                ) {
                    try {
                        videoElement.currentTime = parseInt(propValue, 10) / 1000;
                        onPropChanged('time');
                    } catch (_e) {}
                }
                break;
            }
            case 'selectedSubtitlesTrackId': {
                if (videoElement.mediaId && stream !== null) {
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
                        ].forEach(function (key) {
                            luna({
                                method: key,
                                parameters: {
                                    mediaId: videoElement.mediaId,
                                    charColor: subStyles.color,
                                    bgColor: subStyles.bg_color === 'none' ? 'black' : subStyles.bg_color,
                                    position: subStyles.position,
                                    fontSize: subStyles.font_size,
                                    bgOpacity: subStyles.bg_opacity,
                                    charOpacity: subStyles.char_opacity
                                }
                            });
                        });

                        console.log(
                            'WebOS',
                            'change subtitles for id: ',
                            videoElement.mediaId,
                            ' index:',
                            propValue
                        );

                        currentSubTrack = propValue;
                        var trackIndex = parseInt(propValue.replace('EMBEDDED_', ''));
                        console.log('set subs to track idx: ' + trackIndex);

                        setTimeout(function () {
                            var successCb = function () {
                                var selectedSubtitlesTrack = getProp('subtitlesTracks').find(function (track) {
                                    return track.id === propValue;
                                });
                                textTracks = textTracks.map(function (track) {
                                    track.mode = track.id === currentSubTrack ? 'showing' : 'disabled';
                                    return track;
                                });
                                if (selectedSubtitlesTrack) {
                                    events.emit('subtitlesTrackLoaded', selectedSubtitlesTrack);
                                    onPropChanged('selectedSubtitlesTrackId');
                                }
                            };
                            luna(
                                {
                                    method: 'selectTrack',
                                    parameters: {
                                        type: 'text',
                                        mediaId: videoElement.mediaId,
                                        index: trackIndex
                                    }
                                },
                                successCb,
                                successCb
                            );
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
                    var nextOffset = stremioSubOffsets(
                        Math.max(0, Math.min(100, parseInt(subtitlesOffset, 10)))
                    );
                    if (nextOffset === false) nextOffset = -2;
                    subStyles.position = nextOffset;
                    if (videoElement.mediaId) {
                        luna({
                            method: 'setSubtitlePosition',
                            parameters: {
                                mediaId: videoElement.mediaId,
                                position: nextOffset
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
                    if (nextSubSize === false) nextSubSize = 1;
                    subStyles.font_size = nextSubSize;
                    if (videoElement.mediaId) {
                        luna({
                            method: 'setSubtitleFontSize',
                            parameters: {
                                mediaId: videoElement.mediaId,
                                fontSize: nextSubSize
                            }
                        });
                    }
                    onPropChanged('subtitlesSize');
                }
                break;
            }
            case 'subtitlesTextColor': {
                if (typeof propValue === 'string') {
                    var nextColor = 'white';
                    if (stremioColors[propValue] && webOsColors.indexOf(stremioColors[propValue]) > -1) {
                        nextColor = stremioColors[propValue];
                    }
                    subStyles.color = nextColor;
                    if (videoElement.mediaId) {
                        luna({
                            method: 'setSubtitleCharacterColor',
                            parameters: {
                                mediaId: videoElement.mediaId,
                                charColor: nextColor
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
                        if (videoElement.mediaId) {
                            luna({
                                method: 'setSubtitleBackgroundColor',
                                parameters: {
                                    mediaId: videoElement.mediaId,
                                    bgColor: stremioColors[propValue] === 'none' ? 'black' : stremioColors[propValue]
                                }
                            });
                            if (stremioColors[propValue] === 'none') {
                                luna({
                                    method: 'setSubtitleBackgroundOpacity',
                                    parameters: { mediaId: videoElement.mediaId, bgOpacity: 0 }
                                });
                            } else {
                                luna({
                                    method: 'setSubtitleBackgroundOpacity',
                                    parameters: { mediaId: videoElement.mediaId, bgOpacity: 255 }
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
                    var nextSubOpacity = Math.floor((propValue / 100) * 255);
                    subStyles.char_opacity = nextSubOpacity;
                    if (videoElement.mediaId) {
                        luna({
                            method: 'setSubtitleCharacterOpacity',
                            parameters: {
                                mediaId: videoElement.mediaId,
                                charOpacity: nextSubOpacity
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
                    var targetTrack = audioTracks.find(function (t) {
                        return t.id === propValue;
                    });
                    var targetCodec = normCodec((targetTrack && targetTrack.codec) || '');
                    if (videoElement.mediaId) {
                        luna(
                            {
                                method: 'selectTrack',
                                parameters: {
                                    type: 'audio',
                                    mediaId: videoElement.mediaId,
                                    index: trackIndex
                                }
                            },
                            function () {
                                var selectedAudioTrack = getProp('audioTracks').find(function (track) {
                                    return track.id === propValue;
                                });
                                audioTracks = audioTracks.map(function (track) {
                                    track.mode = track.id === currentAudioTrack ? 'showing' : 'disabled';
                                    return track;
                                });
                                if (selectedAudioTrack) {
                                    events.emit('audioTrackLoaded', selectedAudioTrack);
                                    onPropChanged('selectedAudioTrackId');
                                }
                            },
                            function () {
                                // Fallimento: marca codec come unsupported e fallback
                                var nc = targetCodec || '';
                                if (nc && deviceCaps.unsupportedAudio.indexOf(nc) === -1) {
                                    deviceCaps.unsupportedAudio.push(nc);
                                }
                                var fallback = audioTracks.find(function (t) {
                                    return deviceCaps.unsupportedAudio.indexOf(normCodec(t.codec || '')) === -1;
                                });
                                if (fallback) {
                                    setProp('selectedAudioTrackId', fallback.id);
                                } else {
                                    console.log('No compatible audio track available after failure');
                                }
                            }
                        );
                    }
                    if (videoElement && videoElement.audioTracks) {
                        for (var i = 0; i < videoElement.audioTracks.length; i++) {
                            videoElement.audioTracks[i].enabled = false;
                        }
                        if (videoElement.audioTracks[trackIndex]) {
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

                    // GATING: solo progressive (alcuni pipeline HLS non supportano rate != 1.0)
                    var isProgressive =
                        !!(stream && typeof stream.url === 'string') &&
                        /^https?:.*\.(mp4|mkv|mov|m4v)(\?|#|$)/i.test(stream.url);

                    if (videoElement.mediaId && isProgressive) {
                        luna({
                            method: 'setPlayRate',
                            parameters: {
                                mediaId: videoElement.mediaId,
                                playRate: lastPlaybackSpeed,
                                audioOutput: true
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
                if (commandArgs && commandArgs.stream && typeof commandArgs.stream.url === 'string') {
                    stream = commandArgs.stream;
                    startTime = commandArgs.time;

                    onPropChanged('stream');
                    videoElement.autoplay =
                        typeof commandArgs.autoplay === 'boolean' ? commandArgs.autoplay : true;

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
                    var MAX_TRIES = 12; // ~3.6s (12 * 300ms)

                    var initMediaId = function (cb) {
                        function retrieveMediaId() {
                            if (videoElement.mediaId) {
                                clearInterval(timer);
                                retrieveExtendedTracks();
                                retrieveDeviceInfo(deviceCaps);
                                cb();
                                return;
                            }
                            count++;
                            if (count > MAX_TRIES) {
                                clearInterval(timer);
                                retrieveExtendedTracks();
                                retrieveDeviceInfo(deviceCaps);
                                cb();
                            }
                        }
                        var timer = setInterval(retrieveMediaId, 300);
                    };

                    var startVideo = function () {
                        try {
                            videoElement.load();
                        } catch (_e1) {}
                        try {
                            var p = videoElement.play();
                            if (p && typeof p.catch === 'function') p.catch(function () {});
                        } catch (_e2) {}
                    };

                    videoElement.src = stream.url;
                    initMediaId(startVideo);
                } else {
                    onError(
                        Object.assign({}, ERROR.UNSUPPORTED_STREAM, {
                            critical: true,
                            stream: commandArgs ? commandArgs.stream : null
                        })
                    );
                }
                break;
            }
            case 'unload': {
                stream = null;
                startTime = null;
                Array.from(videoElement.textTracks || []).forEach(function (track) {
                    track.oncuechange = null;
                });
                videoElement.removeAttribute('src');
                try {
                    videoElement.load();
                } catch (_e) {}
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
                videoElement.oncanplaythrough = null;
                videoElement.onloadeddata = null;
                videoElement.onloadedmetadata = null;
                videoElement.onvolumechange = null;
                videoElement.onratechange = null;
                if (videoElement.textTracks) videoElement.textTracks.onchange = null;
                if (videoElement.parentNode === containerElement) containerElement.removeChild(videoElement);
                if (styleElement.parentNode === containerElement) containerElement.removeChild(styleElement);
                break;
            }
        }
    }

    this.on = function (eventName, listener) {
        if (destroyed) throw new Error('Video is destroyed');
        events.on(eventName, listener);
    };

    this.dispatch = function (action) {
        if (destroyed) throw new Error('Video is destroyed');

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

/* ------------------------------------
 * Static
 * ------------------------------------ */
WebOsVideo.canPlayStream = function () {
    return Promise.resolve(true);
};

WebOsVideo.manifest = {
    name: 'WebOsVideo',
    external: false,
    props: [
        'stream',
        'loaded',
        'paused',
        'time',
        'duration',
        'buffering',
        'buffered',
        'audioTracks',
        'selectedAudioTrackId',
        'subtitlesTracks',
        'selectedSubtitlesTrackId',
        'subtitlesOffset',
        'subtitlesSize',
        'subtitlesTextColor',
        'subtitlesBackgroundColor',
        'subtitlesOpacity',
        'volume',
        'muted',
        'playbackSpeed'
    ],
    commands: ['load', 'unload', 'destroy'],
    events: ['propValue', 'propChanged', 'ended', 'error', 'subtitlesTrackLoaded', 'audioTrackLoaded']
};

module.exports = WebOsVideo;
