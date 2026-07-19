var EventEmitter = require('eventemitter3');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var Color = require('color');
var ERROR = require('../error');
var binarySearchUpperBound = require('./binarySearchUpperBound');
var subtitlesParser = require('./subtitlesParser');
var subtitlesRenderer = require('./subtitlesRenderer');
var subtitlesConverter = require('./subtitlesConverter');
var subtitleTypes = require('./subtitleTypes');
var createASSRenderer = require('./assRenderer');

const PREVIEW_INTERVAL = 300000;
const NATIVE_ASS_TIMEOUT = 10000;

function withHTMLSubtitles(Video) {
    function VideoWithHTMLSubtitles(options) {
        options = options || {};

        var video = new Video(options);
        video.on('error', onVideoError);
        video.on('propValue', onVideoPropEvent.bind(null, 'propValue'));
        video.on('propChanged', onVideoPropEvent.bind(null, 'propChanged'));
        Video.manifest.events
            .filter(function(eventName) {
                return !['error', 'propValue', 'propChanged'].includes(eventName);
            })
            .forEach(function(eventName) {
                video.on(eventName, onOtherVideoEvent(eventName));
            });

        var containerElement = options.containerElement;
        if (!(containerElement instanceof HTMLElement)) {
            throw new Error('Container element required to be instance of HTMLElement');
        }

        var assRenderer = createASSRenderer({
            containerElement: containerElement,
            onError: function(error, track) {
                if (track && track.id === selectedEmbeddedASSTrackId) {
                    fallbackFromEmbeddedASS(error, track);
                    return;
                }
                fallbackFromASS(error, track, selectedSubtitleText)
                    .catch(function(fallbackError) {
                        reportSubtitleError(fallbackError, track);
                    });
            }
        });

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

        var videoElement = containerElement.querySelector('video');
        var nativeTextTrack = null;
        var syntheticNativeTextTracks = [];

        function createNativeTrack() {
            removeNativeTrack();
            if (cuesByTime === null || selectedTrackId === null) return false;
            var selectedTrack = tracks.find(function(track) { return track.id === selectedTrackId; });
            if (!selectedTrack) return false;
            var delayMs = delay || 0;
            nativeTextTrack = videoElement.addTextTrack('subtitles', selectedTrack.label || selectedTrack.lang, selectedTrack.lang || '');
            syntheticNativeTextTracks.push(nativeTextTrack);
            cuesByTime.times.forEach(function(time) {
                cuesByTime[time].forEach(function(cue) {
                    if (cue.startTime !== time) return;
                    var start = (cue.startTime + delayMs) / 1000;
                    var end = (cue.endTime + delayMs) / 1000;
                    if (start < 0) start = 0;
                    if (end <= start) return;
                    nativeTextTrack.addCue(new VTTCue(start, end, cue.text));
                });
            });
            nativeTextTrack.mode = 'showing';
            return true;
        }
        function removeNativeTrack() {
            if (nativeTextTrack !== null) {
                nativeTextTrack.mode = 'disabled';
                nativeTextTrack = null;
            }
        }
        function isNativeTextTrack(track) {
            return syntheticNativeTextTracks.includes(track);
        }
        function getEmbeddedTrackIndex(trackId) {
            if (typeof trackId !== 'string' || !trackId.startsWith('EMBEDDED_')) {
                return null;
            }
            var index = parseInt(trackId.replace('EMBEDDED_', ''), 10);
            return isNaN(index) ? null : index;
        }
        function isWebkitDisplayingFullscreen() {
            return videoElement && videoElement.webkitDisplayingFullscreen === true;
        }
        function onWebkitBeginFullscreen() {
            createNativeTrack();
            subtitlesElement.style.display = 'none';
        }
        function onWebkitEndFullscreen() {
            removeNativeTrack();
            subtitlesElement.style.display = '';
        }
        if (videoElement) {
            videoElement.addEventListener('webkitbeginfullscreen', onWebkitBeginFullscreen);
            videoElement.addEventListener('webkitendfullscreen', onWebkitEndFullscreen);
        }

        var videoState = {
            time: null,
            paused: false,
            buffering: false,
            lastSyncAt: null,
            playbackSpeed: 1
        };
        var rafId = null;
        var lastTimeIndex = null;
        var forceRender = false;
        var cuesByTime = null;
        var events = new EventEmitter();
        var destroyed = false;
        var tracks = [];
        var selectedTrackId = null;
        var delay = null;
        var size = 100;
        var offset = 0;
        var textColor = 'rgb(255, 255, 255)';
        var backgroundColor = 'rgba(0, 0, 0, 0)';
        var outlineColor = 'rgb(34, 34, 34)';
        var opacity = 1;
        var preview = [];
        var assSubtitlesStylingEnabled = false;
        var assSubtitlesStylingActive = false;
        var videoAssSubtitlesStylingActive = false;
        var usingASSRenderer = false;
        var selectedSubtitleText = null;
        var selectionRequestId = 0;
        var embeddedASSSources = [];
        var videoSubtitleTracks = [];
        var selectedEmbeddedASSTrackId = null;
        var embeddedSubtitlesOpacity = 1;
        var nativeAssSubtitlesSupported = options.shellTransport &&
            options.shellTransport.capabilities &&
            options.shellTransport.capabilities.nativeAssSubtitles === true;
        var nativeAssTrackId = null;
        var pendingNativeAss = null;
        var abandonedNativeAssTitles = [];
        var removingNativeAssTrackIds = [];

        var observedProps = {
            extraSubtitlesTracks: false,
            selectedExtraSubtitlesTrackId: false,
            extraSubtitlesDelay: false,
            extraSubtitlesSize: false,
            extraSubtitlesOffset: false,
            extraSubtitlesTextColor: false,
            extraSubtitlesBackgroundColor: false,
            extraSubtitlesOutlineColor: false,
            extraSubtitlesOpacity: false,
            extraSubtitlesPreview: false,
            assSubtitlesStylingActive: false,
        };

        function getCurrentTime() {
            if (videoState.time === null || !isFinite(videoState.time)) {
                return null;
            }
            if (videoState.paused || videoState.buffering || videoState.lastSyncAt === null) {
                return videoState.time;
            }
            return videoState.time + (Date.now() - videoState.lastSyncAt) * videoState.playbackSpeed;
        }
        function startRenderLoop() {
            if (rafId !== null) {
                return;
            }
            (function loop() {
                renderSubtitles();
                rafId = requestAnimationFrame(loop);
            })();
        }
        function stopRenderLoop() {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        }
        function renderSubtitles() {
            var time = getCurrentTime();

            if (usingASSRenderer) {
                if (time !== null) {
                    assRenderer.setTime(time);
                }
                return;
            }

            if (cuesByTime === null || time === null) {
                if (lastTimeIndex !== null) {
                    while (subtitlesElement.hasChildNodes()) {
                        subtitlesElement.removeChild(subtitlesElement.lastChild);
                    }
                    lastTimeIndex = null;
                }
                forceRender = false;
                return;
            }

            var timeIndex = binarySearchUpperBound(cuesByTime.times, time - delay);
            if (timeIndex === lastTimeIndex && !forceRender) {
                return;
            }
            lastTimeIndex = timeIndex;
            forceRender = false;

            while (subtitlesElement.hasChildNodes()) {
                subtitlesElement.removeChild(subtitlesElement.lastChild);
            }

            if (timeIndex === -1) {
                return;
            }

            subtitlesElement.style.bottom = offset + '%';
            subtitlesElement.style.opacity = opacity;
            subtitlesRenderer.render(cuesByTime, timeIndex).forEach(function(cueNode) {
                cueNode.style.display = 'inline-block';
                cueNode.style.padding = '0.2em';
                cueNode.style.whiteSpace = 'pre-wrap';
                var fontSizeMultiplier = window.screen720p ? 1.538 : 1;
                cueNode.style.fontSize = Math.floor((size / 25) * fontSizeMultiplier) + 'vmin';
                cueNode.style.color = textColor;
                cueNode.style.backgroundColor = backgroundColor;
                cueNode.style.textShadow = '-0.15rem -0.15rem 0.15rem ' + outlineColor + ', 0px -0.15rem 0.15rem ' + outlineColor + ', 0.15rem -0.15rem 0.15rem ' + outlineColor + ', -0.15rem 0px 0.15rem ' + outlineColor + ', 0.15rem 0px 0.15rem ' + outlineColor + ', -0.15rem 0.15rem 0.15rem ' + outlineColor + ', 0px 0.15rem 0.15rem ' + outlineColor + ', 0.15rem 0.15rem 0.15rem ' + outlineColor;
                subtitlesElement.appendChild(cueNode);
                subtitlesElement.appendChild(document.createElement('br'));
            });
        }
        function setPreview() {
            if (cuesByTime === null || videoState.time === null || !isFinite(videoState.time)) {
                return;
            }

            const currentTime = videoState.time - delay;
            const startInterval = currentTime - PREVIEW_INTERVAL;
            const endInterval = currentTime + PREVIEW_INTERVAL;

            preview = Object.values(cuesByTime).flat().filter((cue) => cue.startTime >= startInterval && cue.endTime <= endInterval).map(({ startTime, endTime, text }) => ({
                startTime,
                endTime,
                text,
                isCurrent: startTime <= currentTime && endTime >= currentTime
            }));
            onPropChanged('extraSubtitlesPreview');
        }
        function onVideoError(error) {
            events.emit('error', error);
            if (error.critical) {
                command('unload');
            }
        }
        function onVideoPropEvent(eventName, propName, propValue) {
            switch (propName) {
                case 'time': {
                    videoState.time = propValue;
                    videoState.lastSyncAt = Date.now();
                    if (usingASSRenderer) {
                        assRenderer.setTime(propValue, true);
                    }
                    setPreview();
                    break;
                }
                case 'assSubtitlesStylingActive': {
                    videoAssSubtitlesStylingActive = propValue === true;
                    break;
                }
                case 'subtitlesTracks': {
                    videoSubtitleTracks = Array.isArray(propValue) ? propValue : [];
                    updateNativeASSTrack(propValue);
                    break;
                }
                case 'paused': {
                    if (propValue && !videoState.paused && !videoState.buffering && videoState.lastSyncAt !== null && videoState.time !== null) {
                        videoState.time = videoState.time + (Date.now() - videoState.lastSyncAt) * videoState.playbackSpeed;
                        videoState.lastSyncAt = Date.now();
                    } else if (!propValue && videoState.paused) {
                        videoState.lastSyncAt = Date.now();
                    }
                    videoState.paused = propValue;
                    break;
                }
                case 'buffering': {
                    if (propValue && !videoState.buffering && !videoState.paused && videoState.lastSyncAt !== null && videoState.time !== null) {
                        videoState.time = videoState.time + (Date.now() - videoState.lastSyncAt) * videoState.playbackSpeed;
                        videoState.lastSyncAt = Date.now();
                    } else if (!propValue && videoState.buffering) {
                        videoState.lastSyncAt = Date.now();
                    }
                    videoState.buffering = propValue;
                    break;
                }
                case 'playbackSpeed': {
                    if (propValue !== null && isFinite(propValue)) {
                        if (!videoState.paused && !videoState.buffering && videoState.lastSyncAt !== null && videoState.time !== null) {
                            videoState.time = videoState.time + (Date.now() - videoState.lastSyncAt) * videoState.playbackSpeed;
                            videoState.lastSyncAt = Date.now();
                        }
                        videoState.playbackSpeed = propValue;
                    }
                    break;
                }
            }

            events.emit(eventName, propName, getProp(propName, propValue));

            if (propName === 'selectedSubtitlesTrackId' && propValue !== null && selectedTrackId !== null && nativeTextTrack === null && !isNativeASSSelection(propValue)) {
                setProp('selectedExtraSubtitlesTrackId', null);
            }
        }
        function onOtherVideoEvent(eventName) {
            return function() {
                events.emit.apply(events, [eventName].concat(Array.from(arguments)));
            };
        }
        function onPropChanged(propName) {
            if (observedProps[propName]) {
                events.emit('propChanged', propName, getProp(propName, null));
            }
        }
        function onError(error) {
            events.emit('error', error);
            if (error.critical) {
                command('unload');
                video.dispatch({ type: 'command', commandName: 'unload' });
            }
        }
        function setASSSubtitlesStylingActive(value) {
            value = value === true;
            if (assSubtitlesStylingActive !== value) {
                assSubtitlesStylingActive = value;
                onPropChanged('assSubtitlesStylingActive');
            }
        }
        function getNativeASSRawTrackId(trackId) {
            return typeof trackId === 'string' && trackId.startsWith('EMBEDDED_') ?
                trackId.slice('EMBEDDED_'.length) :
                null;
        }
        function removeNativeASSTrack(trackId) {
            var rawTrackId = getNativeASSRawTrackId(trackId);
            if (rawTrackId !== null) {
                options.shellTransport.send('mpv-command', ['sub-remove', rawTrackId]);
            }
        }
        function clearNativeASS() {
            if (pendingNativeAss !== null) {
                clearTimeout(pendingNativeAss.timeout);
                if (!abandonedNativeAssTitles.includes(pendingNativeAss.title)) {
                    abandonedNativeAssTitles.push(pendingNativeAss.title);
                }
                pendingNativeAss = null;
            }
            if (nativeAssTrackId !== null) {
                removeNativeASSTrack(nativeAssTrackId);
                nativeAssTrackId = null;
            }
        }
        function isNativeASSSelection(trackId) {
            return nativeAssTrackId === trackId || pendingNativeAss !== null;
        }
        function getPublicSubtitleTrack(track) {
            var publicTrack = Object.assign({}, track);
            if (getEmbeddedASSSource(track) !== null) {
                publicTrack.ass = true;
            }
            delete publicTrack.nativeExternal;
            delete publicTrack.nativeExternalFilename;
            delete publicTrack.nativeExternalTitle;
            delete publicTrack._hlsSubtitlePlaylistURL;
            return publicTrack;
        }
        function getEmbeddedSubtitleId(track) {
            if (!track || typeof track._hlsSubtitlePlaylistURL !== 'string') {
                return null;
            }

            var match = track._hlsSubtitlePlaylistURL.match(/(?:^|\/)subtitle(\d+)\.m3u8(?:$|[?#])/i);
            return match === null ? null : match[1];
        }
        function getEmbeddedASSSource(track) {
            var subtitleId = getEmbeddedSubtitleId(track);
            if (subtitleId === null) {
                return null;
            }

            return embeddedASSSources.find(function(source) {
                return String(source.id) === subtitleId;
            }) || null;
        }
        function isManagedNativeASSTrack(track) {
            return track.id === nativeAssTrackId ||
                removingNativeAssTrackIds.includes(track.id) ||
                (pendingNativeAss !== null && track.nativeExternalTitle === pendingNativeAss.title) ||
                abandonedNativeAssTitles.includes(track.nativeExternalTitle);
        }
        function updateNativeASSTrack(subtitleTracks) {
            if (!Array.isArray(subtitleTracks)) {
                return;
            }

            removingNativeAssTrackIds = removingNativeAssTrackIds.filter(function(trackId) {
                return subtitleTracks.some(function(track) { return track.id === trackId; });
            });
            abandonedNativeAssTitles = abandonedNativeAssTitles.filter(function(title) {
                var abandonedTracks = subtitleTracks.filter(function(track) {
                    return track.nativeExternalTitle === title;
                });
                abandonedTracks.forEach(function(track) {
                    removingNativeAssTrackIds.push(track.id);
                    removeNativeASSTrack(track.id);
                });
                return abandonedTracks.length === 0;
            });

            if (pendingNativeAss === null) {
                return;
            }
            var matchingTrack = subtitleTracks.slice().reverse().find(function(track) {
                return track.nativeExternalTitle === pendingNativeAss.title;
            });
            if (!matchingTrack) {
                return;
            }

            var loadedTrack = pendingNativeAss.track;
            clearTimeout(pendingNativeAss.timeout);
            pendingNativeAss = null;
            nativeAssTrackId = matchingTrack.id;
            video.dispatch({
                type: 'setProp',
                propName: 'subtitlesDelay',
                propValue: (delay || 0) / 1000,
            });
            events.emit('extraSubtitlesTrackLoaded', loadedTrack);
        }
        function updateTrackASS(track, isASS) {
            var trackIndex = tracks.findIndex(function(candidate) {
                return candidate.id === track.id;
            });
            if (trackIndex !== -1 && tracks[trackIndex].ass !== isASS) {
                tracks[trackIndex] = Object.assign({}, tracks[trackIndex], { ass: isASS });
                onPropChanged('extraSubtitlesTracks');
            }
        }
        function reportSubtitleError(error, track) {
            onError(Object.assign({}, ERROR.WITH_HTML_SUBTITLES.LOAD_FAILED, {
                error: error,
                track: track,
                critical: false
            }));
        }
        function getSubtitlesData(track, isFallback) {
            var url = isFallback ? track.fallbackUrl : track.url;

            if (!isFallback && typeof track.content === 'string') {
                return Promise.resolve(track.content);
            }
            if (typeof url === 'string') {
                return fetch(url)
                    .then(function(resp) {
                        if (resp.ok) {
                            return resp.text();
                        }

                        throw new Error(resp.status + ' (' + resp.statusText + ')');
                    });
            }
            if (!isFallback && track.buffer instanceof ArrayBuffer) {
                try {
                    return Promise.resolve(new TextDecoder().decode(new Uint8Array(track.buffer)));
                } catch (error) {
                    return Promise.reject(error);
                }
            }

            return Promise.reject(new Error('No `url`, `content` or `buffer` field available for this track'));
        }
        function loadPlainSubtitles(track, text, isASS, currentRequestId) {
            usingASSRenderer = false;
            setASSSubtitlesStylingActive(false);
            subtitlesElement.style.display = '';

            return Promise.resolve()
                .then(function() {
                    return subtitlesConverter.convert(text, isASS ? 'ass' : null);
                })
                .then(function(convertedText) {
                    return subtitlesParser.parse(convertedText);
                })
                .then(function(result) {
                    if (currentRequestId !== selectionRequestId || selectedTrackId !== track.id) {
                        return null;
                    }

                    cuesByTime = result;
                    startRenderLoop();
                    setPreview();
                    if (isWebkitDisplayingFullscreen() && nativeTextTrack === null) {
                        createNativeTrack();
                    }
                    events.emit('extraSubtitlesTrackLoaded', track);
                    return track;
                });
        }
        function fallbackFromASS(error, track, text, currentRequestId) {
            currentRequestId = currentRequestId || selectionRequestId;
            if (!track || currentRequestId !== selectionRequestId || selectedTrackId !== track.id) {
                return Promise.resolve(null);
            }

            reportSubtitleError(error, track);
            assRenderer.destroy();
            return typeof text === 'string' ?
                loadPlainSubtitles(track, text, true, currentRequestId) :
                Promise.resolve(null);
        }
        function clearEmbeddedASS() {
            if (selectedEmbeddedASSTrackId === null) {
                return;
            }

            selectedEmbeddedASSTrackId = null;
            usingASSRenderer = false;
            setASSSubtitlesStylingActive(false);
            assRenderer.destroy();
            subtitlesElement.style.display = '';
            if (selectedTrackId === null) {
                stopRenderLoop();
            }
        }
        function fallbackFromEmbeddedASS(error, track, currentRequestId) {
            currentRequestId = currentRequestId || selectionRequestId;
            if (!track || currentRequestId !== selectionRequestId || selectedEmbeddedASSTrackId !== track.id) {
                return;
            }

            var trackId = selectedEmbeddedASSTrackId;
            reportSubtitleError(error, getPublicSubtitleTrack(track));
            clearEmbeddedASS();
            video.dispatch({
                type: 'setProp',
                propName: 'selectedSubtitlesTrackId',
                propValue: trackId,
            });
        }
        function loadEmbeddedASS(track, source, currentRequestId) {
            var assTrack = Object.assign({}, getPublicSubtitleTrack(track), {
                ass: true,
                codec: source.codec,
                fonts: Array.isArray(source.fonts) ? source.fonts : [],
                url: source.url,
            });

            cuesByTime = null;
            usingASSRenderer = true;
            setASSSubtitlesStylingActive(false);
            subtitlesElement.style.display = 'none';
            while (subtitlesElement.hasChildNodes()) {
                subtitlesElement.removeChild(subtitlesElement.lastChild);
            }
            lastTimeIndex = null;
            assRenderer.setDelay(0);
            assRenderer.setOpacity(embeddedSubtitlesOpacity);
            startRenderLoop();

            return getSubtitlesData(assTrack, false)
                .then(function(text) {
                    if (currentRequestId !== selectionRequestId || selectedEmbeddedASSTrackId !== track.id) {
                        return null;
                    }

                    return assRenderer.load(assTrack, text);
                })
                .then(function(loadedTrack) {
                    if (currentRequestId !== selectionRequestId || selectedEmbeddedASSTrackId !== track.id) {
                        return null;
                    }
                    if (loadedTrack !== null) {
                        setASSSubtitlesStylingActive(true);
                        events.emit('subtitlesTrackLoaded', getPublicSubtitleTrack(track));
                    }
                    return loadedTrack;
                })
                .catch(function(error) {
                    fallbackFromEmbeddedASS(error, assTrack, currentRequestId);
                    return null;
                });
        }
        function loadASSSubtitles(track, text, currentRequestId) {
            cuesByTime = null;
            usingASSRenderer = true;
            subtitlesElement.style.display = 'none';
            while (subtitlesElement.hasChildNodes()) {
                subtitlesElement.removeChild(subtitlesElement.lastChild);
            }
            lastTimeIndex = null;
            assRenderer.setDelay(delay);
            assRenderer.setOpacity(opacity);
            startRenderLoop();

            return assRenderer.load(track, text)
                .then(function(loadedTrack) {
                    if (currentRequestId !== selectionRequestId || selectedTrackId !== track.id) {
                        return null;
                    }
                    if (loadedTrack !== null) {
                        setASSSubtitlesStylingActive(true);
                        events.emit('extraSubtitlesTrackLoaded', track);
                    }
                    return loadedTrack;
                })
                .catch(function(error) {
                    return fallbackFromASS(error, track, text, currentRequestId);
                });
        }
        function loadWebSubtitles(track, text, isASS, currentRequestId) {
            return isASS && assSubtitlesStylingEnabled ?
                loadASSSubtitles(track, text, currentRequestId) :
                loadPlainSubtitles(track, text, isASS, currentRequestId);
        }
        function delegateNativeASS(track, url, text, currentRequestId) {
            var title = '__stremio_external_ass_' + currentRequestId;
            var pending = {
                track: track,
                title: title,
                timeout: null,
            };
            pending.timeout = setTimeout(function() {
                if (pendingNativeAss !== pending ||
                    currentRequestId !== selectionRequestId ||
                    selectedTrackId !== track.id) {
                    return;
                }

                pendingNativeAss = null;
                abandonedNativeAssTitles.push(title);
                if (typeof text === 'string') {
                    loadWebSubtitles(track, text, true, currentRequestId);
                } else {
                    loadSelectedTrack(track, false, currentRequestId, true);
                }
            }, NATIVE_ASS_TIMEOUT);
            pendingNativeAss = pending;
            options.shellTransport.send('mpv-command', [
                'sub-add',
                url,
                'select',
                title,
                track.lang,
            ]);
        }
        function loadSelectedTrack(track, isFallback, currentRequestId, forceWeb) {
            return getSubtitlesData(track, isFallback)
                .then(function(text) {
                    if (currentRequestId !== selectionRequestId || selectedTrackId !== track.id) {
                        return null;
                    }

                    selectedSubtitleText = text;
                    var sourceTrack = Object.assign({}, track, {
                        url: isFallback ? track.fallbackUrl : track.url,
                        fallbackUrl: null
                    });
                    var isASS = subtitleTypes.isASSSubtitle(sourceTrack, text);
                    updateTrackASS(track, isASS);
                    if (!forceWeb && nativeAssSubtitlesSupported && isASS && typeof sourceTrack.url === 'string') {
                        delegateNativeASS(track, sourceTrack.url, text, currentRequestId);
                        return null;
                    }
                    return loadWebSubtitles(track, text, isASS, currentRequestId);
                })
                .catch(function(error) {
                    if (currentRequestId !== selectionRequestId || selectedTrackId !== track.id) {
                        return null;
                    }
                    if (!isFallback && typeof track.fallbackUrl === 'string') {
                        return loadSelectedTrack(track, true, currentRequestId, forceWeb);
                    }

                    reportSubtitleError(error, track);
                    return null;
                });
        }
        function getProp(propName, videoPropValue) {
            switch (propName) {
                case 'extraSubtitlesTracks': {
                    if (destroyed) {
                        return [];
                    }

                    return tracks.slice();
                }
                case 'selectedExtraSubtitlesTrackId': {
                    if (destroyed) {
                        return null;
                    }

                    return selectedTrackId;
                }
                case 'extraSubtitlesDelay': {
                    if (destroyed) {
                        return null;
                    }

                    return delay;
                }
                case 'extraSubtitlesSize': {
                    if (destroyed) {
                        return null;
                    }

                    return size;
                }
                case 'extraSubtitlesOffset': {
                    if (destroyed) {
                        return null;
                    }

                    return offset;
                }
                case 'extraSubtitlesTextColor': {
                    if (destroyed) {
                        return null;
                    }

                    return textColor;
                }
                case 'extraSubtitlesBackgroundColor': {
                    if (destroyed) {
                        return null;
                    }

                    return backgroundColor;
                }
                case 'extraSubtitlesOutlineColor': {
                    if (destroyed) {
                        return null;
                    }

                    return outlineColor;
                }
                case 'extraSubtitlesOpacity': {
                    if (destroyed) {
                        return null;
                    }

                    return opacity;
                }
                case 'extraSubtitlesPreview': {
                    if (destroyed) {
                        return [];
                    }
                    return preview;
                }
                case 'assSubtitlesStylingActive': {
                    if (destroyed) {
                        return false;
                    }
                    return assSubtitlesStylingActive || videoAssSubtitlesStylingActive;
                }
                case 'subtitlesTracks': {
                    if (Array.isArray(videoPropValue)) {
                        return videoPropValue.filter(function(track) {
                            if (isManagedNativeASSTrack(track)) {
                                return false;
                            }
                            if (!videoElement || !videoElement.textTracks) {
                                return true;
                            }
                            var index = getEmbeddedTrackIndex(track.id);
                            return index === null || !isNativeTextTrack(videoElement.textTracks[index]);
                        }).map(getPublicSubtitleTrack);
                    }

                    return videoPropValue;
                }
                case 'selectedSubtitlesTrackId': {
                    if (selectedEmbeddedASSTrackId !== null) {
                        return selectedEmbeddedASSTrackId;
                    }
                    if (isNativeASSSelection(videoPropValue)) {
                        return null;
                    }
                    if (typeof videoPropValue === 'string' && videoElement && videoElement.textTracks) {
                        var index = getEmbeddedTrackIndex(videoPropValue);
                        return index !== null && isNativeTextTrack(videoElement.textTracks[index]) ? null : videoPropValue;
                    }

                    return videoPropValue;
                }
                default: {
                    return videoPropValue;
                }
            }
        }
        function observeProp(propName) {
            switch (propName) {
                case 'extraSubtitlesTracks':
                case 'selectedExtraSubtitlesTrackId':
                case 'extraSubtitlesDelay':
                case 'extraSubtitlesSize':
                case 'extraSubtitlesOffset':
                case 'extraSubtitlesTextColor':
                case 'extraSubtitlesBackgroundColor':
                case 'extraSubtitlesOutlineColor':
                case 'extraSubtitlesOpacity':
                case 'extraSubtitlesPreview': {
                    events.emit('propValue', propName, getProp(propName, null));
                    observedProps[propName] = true;
                    return true;
                }
                case 'assSubtitlesStylingActive': {
                    observedProps[propName] = true;
                    if (Video.manifest.props.includes(propName)) {
                        video.dispatch({ type: 'observeProp', propName: propName });
                    } else {
                        events.emit('propValue', propName, getProp(propName, null));
                    }
                    return true;
                }
                default: {
                    return false;
                }
            }
        }
        function setProp(propName, propValue) {
            switch (propName) {
                case 'selectedSubtitlesTrackId': {
                    var selectedVideoTrack = videoSubtitleTracks.find(function(track) {
                        return track.id === propValue;
                    });
                    var embeddedASSSource = getEmbeddedASSSource(selectedVideoTrack);
                    if (assSubtitlesStylingEnabled && selectedVideoTrack && embeddedASSSource !== null) {
                        if (selectedEmbeddedASSTrackId === propValue) {
                            return true;
                        }
                        if (selectedTrackId !== null) {
                            setProp('selectedExtraSubtitlesTrackId', null);
                        }
                        var embeddedRequestId = ++selectionRequestId;
                        clearEmbeddedASS();
                        selectedEmbeddedASSTrackId = propValue;
                        video.dispatch({
                            type: 'setProp',
                            propName: 'selectedSubtitlesTrackId',
                            propValue: null,
                        });
                        loadEmbeddedASS(selectedVideoTrack, embeddedASSSource, embeddedRequestId);
                        return true;
                    }
                    if (selectedEmbeddedASSTrackId !== null) {
                        selectionRequestId = selectionRequestId + 1;
                        clearEmbeddedASS();
                    }

                    return false;
                }
                case 'selectedExtraSubtitlesTrackId': {
                    if (propValue !== null && selectedTrackId === propValue) {
                        return true;
                    }
                    if (propValue !== null && selectedEmbeddedASSTrackId !== null) {
                        selectionRequestId = selectionRequestId + 1;
                        clearEmbeddedASS();
                    }
                    clearNativeASS();
                    if (propValue !== null) {
                        video.dispatch({
                            type: 'setProp',
                            propName: 'selectedSubtitlesTrackId',
                            propValue: null,
                        });
                    }
                    var currentRequestId = ++selectionRequestId;
                    cuesByTime = null;
                    selectedTrackId = null;
                    selectedSubtitleText = null;
                    delay = null;
                    usingASSRenderer = false;
                    setASSSubtitlesStylingActive(false);
                    assRenderer.destroy();
                    subtitlesElement.style.display = '';
                    preview = [];
                    onPropChanged('extraSubtitlesPreview');
                    var selectedTrack = tracks.find(function(track) {
                        return track.id === propValue;
                    });
                    if (!selectedTrack) {
                        stopRenderLoop();
                    }
                    if (selectedTrack) {
                        selectedTrackId = selectedTrack.id;
                        delay = 0;
                        var selectedSourceIsASS = subtitleTypes.isASSSubtitleTrack(Object.assign({}, selectedTrack, {
                            fallbackUrl: null,
                        }));
                        if (nativeAssSubtitlesSupported && selectedSourceIsASS && typeof selectedTrack.url === 'string') {
                            delegateNativeASS(selectedTrack, selectedTrack.url, null, currentRequestId);
                        } else {
                            loadSelectedTrack(selectedTrack, false, currentRequestId, false);
                        }
                    }
                    renderSubtitles();
                    onPropChanged('selectedExtraSubtitlesTrackId');
                    onPropChanged('extraSubtitlesDelay');
                    return true;
                }
                case 'extraSubtitlesDelay': {
                    if (selectedTrackId !== null && propValue !== null && isFinite(propValue)) {
                        delay = parseInt(propValue, 10);
                        assRenderer.setDelay(delay);
                        if (nativeAssTrackId !== null || pendingNativeAss !== null) {
                            video.dispatch({
                                type: 'setProp',
                                propName: 'subtitlesDelay',
                                propValue: delay / 1000,
                            });
                        }
                        forceRender = true;
                        renderSubtitles();
                        onPropChanged('extraSubtitlesDelay');
                    }

                    return true;
                }
                case 'extraSubtitlesSize': {
                    if (propValue !== null && isFinite(propValue)) {
                        size = Math.max(0, parseInt(propValue, 10));
                        forceRender = true;
                        renderSubtitles();
                        onPropChanged('extraSubtitlesSize');
                    }

                    return true;
                }
                case 'extraSubtitlesOffset': {
                    if (propValue !== null && isFinite(propValue)) {
                        offset = Math.max(0, Math.min(100, parseInt(propValue, 10)));
                        forceRender = true;
                        renderSubtitles();
                        onPropChanged('extraSubtitlesOffset');
                    }

                    return true;
                }
                case 'extraSubtitlesTextColor': {
                    if (typeof propValue === 'string') {
                        try {
                            textColor = Color(propValue).rgb().string();
                        } catch (error) {
                            // eslint-disable-next-line no-console
                            console.error('withHTMLSubtitles', error);
                        }

                        forceRender = true;
                        renderSubtitles();
                        onPropChanged('extraSubtitlesTextColor');
                    }

                    return true;
                }
                case 'extraSubtitlesBackgroundColor': {
                    if (typeof propValue === 'string') {
                        try {
                            backgroundColor = Color(propValue).rgb().string();
                        } catch (error) {
                            // eslint-disable-next-line no-console
                            console.error('withHTMLSubtitles', error);
                        }

                        forceRender = true;
                        renderSubtitles();
                        onPropChanged('extraSubtitlesBackgroundColor');
                    }

                    return true;
                }
                case 'extraSubtitlesOutlineColor': {
                    if (typeof propValue === 'string') {
                        try {
                            outlineColor = Color(propValue).rgb().string();
                        } catch (error) {
                            // eslint-disable-next-line no-console
                            console.error('withHTMLSubtitles', error);
                        }

                        forceRender = true;
                        renderSubtitles();
                        onPropChanged('extraSubtitlesOutlineColor');
                    }

                    return true;
                }
                case 'extraSubtitlesOpacity': {
                    if (typeof propValue === 'number') {
                        try {
                            opacity = Math.min(Math.max(propValue / 100, 0), 1);
                        } catch (error) {
                            // eslint-disable-next-line no-console
                            console.error('withHTMLSubtitles', error);
                        }

                        forceRender = true;
                        renderSubtitles();
                        assRenderer.setOpacity(opacity);
                        onPropChanged('extraSubtitlesOpacity');
                    }

                    return true;
                }
                case 'subtitlesOpacity': {
                    if (typeof propValue === 'number') {
                        embeddedSubtitlesOpacity = Math.min(Math.max(propValue / 100, 0), 1);
                        if (selectedEmbeddedASSTrackId !== null) {
                            assRenderer.setOpacity(embeddedSubtitlesOpacity);
                        }
                    }

                    return false;
                }
                default: {
                    return false;
                }
            }
        }
        function command(commandName, commandArgs) {
            switch (commandName) {
                case 'addExtraSubtitlesTracks': {
                    if (commandArgs && Array.isArray(commandArgs.tracks)) {
                        tracks = tracks
                            .concat(commandArgs.tracks.map(function(track) {
                                return Object.assign({}, track, {
                                    ass: subtitleTypes.isASSSubtitleTrack(track),
                                });
                            }))
                            .filter(function(track, index, tracks) {
                                return track &&
                                    typeof track.id === 'string' &&
                                    typeof track.lang === 'string' &&
                                    typeof track.label === 'string' &&
                                    typeof track.origin === 'string' &&
                                    !track.embedded &&
                                    index === tracks.findIndex(function(t) { return t.id === track.id; });
                            });
                        onPropChanged('extraSubtitlesTracks');
                    }

                    return true;
                }
                case 'addLocalSubtitles': {
                    if (commandArgs && typeof commandArgs.filename === 'string' && commandArgs.buffer instanceof ArrayBuffer) {
                        var id = 'LOCAL_' + tracks
                            .filter(function(track) { return track.local; })
                            .length;

                        var track = {
                            id: id,
                            url: null,
                            buffer: commandArgs.buffer,
                            filename: commandArgs.filename,
                            lang: 'local',
                            label: commandArgs.filename,
                            origin: 'LOCAL',
                            local: true,
                            embedded: false,
                            ass: subtitleTypes.isASSSubtitleTrack({ filename: commandArgs.filename }),
                        };

                        tracks.push(track);

                        onPropChanged('extraSubtitlesTracks');
                        events.emit('extraSubtitlesTrackAdded', track);
                    }

                    return true;
                }
                case 'load': {
                    command('unload');
                    assSubtitlesStylingEnabled = commandArgs.assSubtitlesStyling === true;
                    embeddedASSSources = commandArgs.stream && Array.isArray(commandArgs.stream._embeddedASSSources) ?
                        commandArgs.stream._embeddedASSSources
                        :
                        [];
                    if (commandArgs.stream && Array.isArray(commandArgs.stream.subtitles)) {
                        command('addExtraSubtitlesTracks', {
                            tracks: commandArgs.stream.subtitles.map(function(track) {
                                return Object.assign({}, track, {
                                    origin: 'EXCLUSIVE',
                                    exclusive: true,
                                    embedded: false
                                });
                            })
                        });
                    }

                    return false;
                }
                case 'unload': {
                    selectionRequestId = selectionRequestId + 1;
                    clearNativeASS();
                    abandonedNativeAssTitles = [];
                    removingNativeAssTrackIds = [];
                    removeNativeTrack();
                    stopRenderLoop();
                    lastTimeIndex = null;
                    cuesByTime = null;
                    tracks = [];
                    selectedTrackId = null;
                    selectedSubtitleText = null;
                    embeddedASSSources = [];
                    videoSubtitleTracks = [];
                    selectedEmbeddedASSTrackId = null;
                    embeddedSubtitlesOpacity = 1;
                    delay = null;
                    usingASSRenderer = false;
                    setASSSubtitlesStylingActive(false);
                    assRenderer.destroy();
                    subtitlesElement.style.display = '';
                    preview = [];
                    renderSubtitles();
                    onPropChanged('extraSubtitlesTracks');
                    onPropChanged('selectedExtraSubtitlesTrackId');
                    onPropChanged('extraSubtitlesDelay');
                    onPropChanged('extraSubtitlesPreview');
                    return false;
                }
                case 'destroy': {
                    command('unload');
                    destroyed = true;
                    if (videoElement) {
                        videoElement.removeEventListener('webkitbeginfullscreen', onWebkitBeginFullscreen);
                        videoElement.removeEventListener('webkitendfullscreen', onWebkitEndFullscreen);
                    }
                    onPropChanged('extraSubtitlesSize');
                    onPropChanged('extraSubtitlesOffset');
                    onPropChanged('extraSubtitlesTextColor');
                    onPropChanged('extraSubtitlesBackgroundColor');
                    onPropChanged('extraSubtitlesOutlineColor');
                    onPropChanged('extraSubtitlesOpacity');
                    onPropChanged('extraSubtitlesPreview');
                    onPropChanged('assSubtitlesStylingActive');
                    video.dispatch({ type: 'command', commandName: 'destroy' });
                    events.removeAllListeners();
                    containerElement.removeChild(subtitlesElement);
                    return true;
                }
                default: {
                    return false;
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
                        if (observeProp(action.propName)) {
                            return;
                        }

                        break;
                    }
                    case 'setProp': {
                        if (setProp(action.propName, action.propValue)) {
                            return;
                        }

                        break;
                    }
                    case 'command': {
                        if (command(action.commandName, action.commandArgs)) {
                            return;
                        }

                        break;
                    }
                }
            }

            video.dispatch(action);
        };
    }

    VideoWithHTMLSubtitles.canPlayStream = function(stream) {
        return Video.canPlayStream(stream);
    };

    VideoWithHTMLSubtitles.manifest = {
        name: Video.manifest.name + 'WithHTMLSubtitles',
        external: Video.manifest.external,
        props: Video.manifest.props.concat(['extraSubtitlesTracks', 'selectedExtraSubtitlesTrackId', 'extraSubtitlesDelay', 'extraSubtitlesSize', 'extraSubtitlesOffset', 'extraSubtitlesTextColor', 'extraSubtitlesBackgroundColor', 'extraSubtitlesOutlineColor', 'extraSubtitlesOpacity', 'extraSubtitlesPreview', 'assSubtitlesStylingActive'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; }),
        commands: Video.manifest.commands.concat(['load', 'unload', 'destroy', 'addExtraSubtitlesTracks', 'addLocalSubtitles'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; }),
        events: Video.manifest.events.concat(['propValue', 'propChanged', 'error', 'extraSubtitlesTrackLoaded', 'extraSubtitlesTrackAdded'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; })
    };

    return VideoWithHTMLSubtitles;
}

module.exports = withHTMLSubtitles;
