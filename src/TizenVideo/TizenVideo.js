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

    let isBuffering = false;

    var containerElement = options.containerElement;
    if (!(containerElement instanceof HTMLElement)) {
        throw new Error('Container element required to be instance of HTMLElement');
    }

    var styleElement = document.createElement('style');
    containerElement.appendChild(styleElement);
    styleElement.sheet.insertRule('video::cue { font-size: 4vmin; color: rgb(255, 255, 255); background-color: rgba(0, 0, 0, 0); text-shadow: rgb(34, 34, 34) 1px 1px 0.1em; }');
    var objElement = document.createElement('object');
    objElement.type = 'application/avplayer';
    objElement.style.width = '100%';
    objElement.style.height = '100%';
    objElement.style.backgroundColor = 'black';
//    videoElement.style.width = '100%';
//    videoElement.style.height = '100%';
//    videoElement.style.backgroundColor = 'black';
//    videoElement.crossOrigin = 'anonymous';
//    videoElement.controls = false;
    var Listener = {
        onbufferingstart: function() {
            console.log("Buffering start.");
            onPropChanged('buffering');
            isBuffering = true;
        },
        onbufferingprogress: function(percent) {
            console.log("Buffering progress data : " + percent);
            onPropChanged('buffering');
            isBuffering = true;
        },
        onbufferingcomplete: function() {
            console.log("Buffering complete.");
            isBuffering = false;
            onPropChanged('buffering');
        },
        oncurrentplaytime: function(currentTime) {
            console.log("Current Playtime : " + currentTime);
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
            console.log("Subtitle Changed.");
        },
        ondrmevent: function(drmEvent, drmData) {
            console.log("DRM callback: " + drmEvent + ", data: " + drmData);
        },
        onstreamcompleted: function() {
            console.log("Stream Completed");
            onEnded();
        }
    };
    webapis.avplay.setListener(Listener);
    // videoElement.onerror = function() {
    //     onVideoError();
    // };
    // videoElement.onended = function() {
    //     onEnded();
    // };
    // videoElement.onpause = function() {
    //     onPropChanged('paused');
    // };
    // videoElement.onplay = function() {
    //     onPropChanged('paused');
    // };
    // videoElement.ontimeupdate = function() {
    //     onPropChanged('time');
    //     onPropChanged('buffered');
    // };
    // videoElement.ondurationchange = function() {
    //     onPropChanged('duration');
    // };
    // videoElement.onwaiting = function() {
    //     onPropChanged('buffering');
    //     onPropChanged('buffered');
    // };
    // videoElement.onseeking = function() {
    //     onPropChanged('buffering');
    //     onPropChanged('buffered');
    // };
    // videoElement.onseeked = function() {
    //     onPropChanged('buffering');
    //     onPropChanged('buffered');
    // };
    // videoElement.onstalled = function() {
    //     onPropChanged('buffering');
    //     onPropChanged('buffered');
    // };
    // videoElement.onplaying = function() {
    //     onPropChanged('buffering');
    //     onPropChanged('buffered');
    // };
    // videoElement.oncanplay = function() {
    //     onPropChanged('buffering');
    //     onPropChanged('buffered');
    // };
    // videoElement.canplaythrough = function() {
    //     onPropChanged('buffering');
    //     onPropChanged('buffered');
    // };
    // videoElement.onloadeddata = function() {
    //     onPropChanged('buffering');
    //     onPropChanged('buffered');
    // };
    // videoElement.onvolumechange = function() {
    //     onPropChanged('volume');
    //     onPropChanged('muted');
    // };
    // videoElement.onratechange = function() {
    //     onPropChanged('playbackSpeed');
    // };
    // videoElement.textTracks.onchange = function() {
    //     onPropChanged('subtitlesTracks');
    //     onPropChanged('selectedSubtitlesTrackId');
    //     onCueChange();
    //     Array.from(videoElement.textTracks).forEach(function(track) {
    //         track.oncuechange = onCueChange;
    //     });
    // };

    containerElement.appendChild(objElement);
//    document.body.appendChild(objElement);

    var hls = null;
    var events = new EventEmitter();
    var destroyed = false;
    var stream = null;
    var subtitlesOffset = 0;
    var observedProps = {
        stream: false,
        paused: false,
        time: false,
        duration: false,
        buffering: false,
        // buffered: false,
        // subtitlesTracks: false,
        // selectedSubtitlesTrackId: false,
        // subtitlesOffset: false,
        // subtitlesSize: false,
        // subtitlesTextColor: false,
        // subtitlesBackgroundColor: false,
        // subtitlesOutlineColor: false,
        // audioTracks: false,
        // selectedAudioTrackId: false,
        // volume: false,
        // muted: false,
        // playbackSpeed: false
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
            // case 'subtitlesTracks': {
            //     if (stream === null) {
            //         return [];
            //     }

            //     return Array.from(videoElement.textTracks)
            //         .map(function(track, index) {
            //             return Object.freeze({
            //                 id: 'EMBEDDED_' + String(index),
            //                 lang: track.language,
            //                 label: track.label,
            //                 origin: 'EMBEDDED',
            //                 embedded: true
            //             });
            //         });
            // }
            // case 'selectedSubtitlesTrackId': {
            //     if (stream === null) {
            //         return null;
            //     }

            //     return Array.from(videoElement.textTracks)
            //         .reduce(function(result, track, index) {
            //             if (result === null && track.mode === 'showing') {
            //                 return 'EMBEDDED_' + String(index);
            //             }

            //             return result;
            //         }, null);
            // }
            // case 'subtitlesOffset': {
            //     if (destroyed) {
            //         return null;
            //     }

            //     return subtitlesOffset;
            // }
            // case 'subtitlesSize': {
            //     if (destroyed) {
            //         return null;
            //     }

            //     return parseInt(styleElement.sheet.cssRules[0].style.fontSize, 10) * 25;
            // }
            // case 'subtitlesTextColor': {
            //     if (destroyed) {
            //         return null;
            //     }

            //     return styleElement.sheet.cssRules[0].style.color;
            // }
            // case 'subtitlesBackgroundColor': {
            //     if (destroyed) {
            //         return null;
            //     }

            //     return styleElement.sheet.cssRules[0].style.backgroundColor;
            // }
            // case 'subtitlesOutlineColor': {
            //     if (destroyed) {
            //         return null;
            //     }

            //     return styleElement.sheet.cssRules[0].style.textShadow.slice(0, styleElement.sheet.cssRules[0].style.textShadow.indexOf(')') + 1);
            // }
            // case 'audioTracks': {
            //     if (hls === null || !Array.isArray(hls.audioTracks)) {
            //         return [];
            //     }

            //     return hls.audioTracks
            //         .map(function(track) {
            //             return Object.freeze({
            //                 id: 'EMBEDDED_' + String(track.id),
            //                 lang: typeof track.lang === 'string' && track.lang.length > 0 ?
            //                     track.lang
            //                     :
            //                     typeof track.name === 'string' && track.name.length > 0 ?
            //                         track.name
            //                         :
            //                         String(track.id),
            //                 label: typeof track.name === 'string' && track.name.length > 0 ?
            //                     track.name
            //                     :
            //                     typeof track.lang === 'string' && track.lang.length > 0 ?
            //                         track.lang
            //                         :
            //                         String(track.id),
            //                 origin: 'EMBEDDED',
            //                 embedded: true
            //             });
            //         });
            // }
            // case 'selectedAudioTrackId': {
            //     if (hls === null || hls.audioTrack === null || !isFinite(hls.audioTrack) || hls.audioTrack === -1) {
            //         return null;
            //     }

            //     return 'EMBEDDED_' + String(hls.audioTrack);
            // }
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
            // case 'playbackSpeed': {
            //     if (destroyed || videoElement.playbackRate === null || !isFinite(videoElement.playbackRate)) {
            //         return null;
            //     }

            //     return videoElement.playbackRate;
            // }
            default: {
                return null;
            }
        }
    }
    // function onCueChange() {
    //     Array.from(videoElement.textTracks).forEach(function(track) {
    //         Array.from(track.cues || []).forEach(function(cue) {
    //             cue.snapToLines = false;
    //             cue.line = 100 - subtitlesOffset;
    //         });
    //     });
    // }
    function onVideoError() {
        if (destroyed) {
            return;
        }

        var error;
        error = ERROR.UNKNOWN_ERROR;
        // switch (videoElement.error.code) {
        //     case 1: {
        //         error = ERROR.HTML_VIDEO.MEDIA_ERR_ABORTED;
        //         break;
        //     }
        //     case 2: {
        //         error = ERROR.HTML_VIDEO.MEDIA_ERR_NETWORK;
        //         break;
        //     }
        //     case 3: {
        //         error = ERROR.HTML_VIDEO.MEDIA_ERR_DECODE;
        //         break;
        //     }
        //     case 4: {
        //         error = ERROR.HTML_VIDEO.MEDIA_ERR_SRC_NOT_SUPPORTED;
        //         break;
        //     }
        //     default: {
        //         error = ERROR.UNKNOWN_ERROR;
        //     }
        // }
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
                    propValue ? webapis.avplay.pause() : webapis.avplay.play();
                }

                setTimeout(() => {
                    onPropChanged('paused');
                })

                break;
            }
            case 'time': {
                if (stream !== null && propValue !== null && isFinite(propValue)) {
                    webapis.avplay.seekTo(parseInt(propValue, 10))
//                    videoElement.currentTime = parseInt(propValue, 10) / 1000;
                }

                break;
            }
            // case 'selectedSubtitlesTrackId': {
            //     if (stream !== null) {
            //         Array.from(videoElement.textTracks)
            //             .forEach(function(track, index) {
            //                 track.mode = 'EMBEDDED_' + String(index) === propValue ? 'showing' : 'disabled';
            //             });
            //         var selecterdSubtitlesTrack = getProp('subtitlesTracks')
            //             .find(function(track) {
            //                 return track.id === propValue;
            //             });
            //         if (selecterdSubtitlesTrack) {
            //             events.emit('subtitlesTrackLoaded', selecterdSubtitlesTrack);
            //         }
            //     }

            //     break;
            // }
            // case 'subtitlesOffset': {
            //     if (propValue !== null && isFinite(propValue)) {
            //         subtitlesOffset = Math.max(0, Math.min(100, parseInt(propValue, 10)));
            //         onCueChange();
            //         onPropChanged('subtitlesOffset');
            //     }

            //     break;
            // }
            // case 'subtitlesSize': {
            //     if (propValue !== null && isFinite(propValue)) {
            //         styleElement.sheet.cssRules[0].style.fontSize = Math.floor(Math.max(0, parseInt(propValue, 10)) / 25) + 'vmin';
            //         onPropChanged('subtitlesSize');
            //     }

            //     break;
            // }
            // case 'subtitlesTextColor': {
            //     if (typeof propValue === 'string') {
            //         try {
            //             styleElement.sheet.cssRules[0].style.color = Color(propValue).rgb().string();
            //         } catch (error) {
            //             // eslint-disable-next-line no-console
            //             console.error('HTMLVideo', error);
            //         }

            //         onPropChanged('subtitlesTextColor');
            //     }

            //     break;
            // }
            // case 'subtitlesBackgroundColor': {
            //     if (typeof propValue === 'string') {
            //         try {
            //             styleElement.sheet.cssRules[0].style.backgroundColor = Color(propValue).rgb().string();
            //         } catch (error) {
            //             // eslint-disable-next-line no-console
            //             console.error('HTMLVideo', error);
            //         }

            //         onPropChanged('subtitlesBackgroundColor');
            //     }

            //     break;
            // }
            // case 'subtitlesOutlineColor': {
            //     if (typeof propValue === 'string') {
            //         try {
            //             styleElement.sheet.cssRules[0].style.textShadow = Color(propValue).rgb().string() + ' 1px 1px 0.1em';
            //         } catch (error) {
            //             // eslint-disable-next-line no-console
            //             console.error('HTMLVideo', error);
            //         }

            //         onPropChanged('subtitlesOutlineColor');
            //     }

            //     break;
            // }
            // case 'selectedAudioTrackId': {
            //     if (hls !== null) {
            //         var selecterdAudioTrack = getProp('audioTracks')
            //             .find(function(track) {
            //                 return track.id === propValue;
            //             });
            //         hls.audioTrack = selecterdAudioTrack ? parseInt(selecterdAudioTrack.id.split('_').pop(), 10) : -1;
            //         if (selecterdAudioTrack) {
            //             events.emit('audioTrackLoaded', selecterdAudioTrack);
            //         }
            //     }

            //     break;
            // }
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
            // case 'playbackSpeed': {
            //     if (propValue !== null && isFinite(propValue)) {
            //         videoElement.playbackRate = parseFloat(propValue);
            //     }

            //     break;
            // }
        }
    }
    function command(commandName, commandArgs) {
        switch (commandName) {
            case 'load': {
//                command('unload');
                if (commandArgs && commandArgs.stream && typeof commandArgs.stream.url === 'string') {
                    stream = commandArgs.stream;
                    onPropChanged('stream');
//                    videoElement.autoplay = typeof commandArgs.autoplay === 'boolean' ? commandArgs.autoplay : true;
//                    webapis.avplay.seekTo(commandArgs.time !== null && isFinite(commandArgs.time) ? parseInt(commandArgs.time, 10) : 0);
//                    videoElement.currentTime = commandArgs.time !== null && isFinite(commandArgs.time) ? parseInt(commandArgs.time, 10) / 1000 : 0;
                    onPropChanged('paused');
                    onPropChanged('time');
                    onPropChanged('duration');
//                    onPropChanged('buffering');
//                    onPropChanged('subtitlesTracks');
//                    onPropChanged('selectedSubtitlesTrackId');
//                    onPropChanged('audioTracks');
//                    onPropChanged('selectedAudioTrackId');
//                    getContentType(stream)
//                        .then(function(contentType) {
                            if (stream !== commandArgs.stream) {
                                return;
                            }

                            // if (contentType === 'application/vnd.apple.mpegurl' && Hls.isSupported()) {
                            //     hls = new Hls(HLS_CONFIG);
                            //     hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, function() {
                            //         onPropChanged('audioTracks');
                            //         onPropChanged('selectedAudioTrackId');
                            //     });
                            //     hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, function() {
                            //         onPropChanged('audioTracks');
                            //         onPropChanged('selectedAudioTrackId');
                            //     });
                            //     hls.loadSource(stream.url);
                            //     hls.attachMedia(videoElement);
                            // } else {
                                webapis.avplay.open(stream.url);
                                webapis.avplay.setDisplayRect(0, 0, 1920, 1080); //call this method after open() - To be called in these states - "IDLE", "PAUSE"
                                webapis.avplay.seekTo(commandArgs.time !== null && isFinite(commandArgs.time) ? parseInt(commandArgs.time, 10) : 0);
                                webapis.avplay.prepare();
                                onPropChanged('duration');
                                webapis.avplay.play();
//                            }
//                        })
//                        .catch(function() {
//                            if (stream !== commandArgs.stream) {
//                                return;
//                            }

//                            webapis.avplay.open(stream.url);
//                            webapis.avplay.setDisplayRect(0, 0, 1920, 1080); //call this method after open() - To be called in these states - "IDLE", "PAUSE"
//                            webapis.avplay.prepare();
//                            onPropChanged('duration');
//                            webapis.avplay.play();
//                            videoElement.src = stream.url;
//                        });
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
//                Array.from(videoElement.textTracks).forEach(function(track) {
//                    track.oncuechange = null;
//                });
                // if (hls !== null) {
                //     hls.removeAllListeners();
                //     hls.detachMedia(videoElement);
                //     hls.destroy();
                //     hls = null;
                // }
//                videoElement.removeAttribute('src');
//                webapis.avplay.pause();
//                webapis.avplay.seekTo(0);
                webapis.avplay.stop();
//                videoElement.currentTime = 0;
                onPropChanged('stream');
                onPropChanged('paused');
                onPropChanged('time');
                onPropChanged('duration');
                onPropChanged('buffering');
                // onPropChanged('subtitlesTracks');
                // onPropChanged('selectedSubtitlesTrackId');
                // onPropChanged('audioTracks');
                // onPropChanged('selectedAudioTrackId');
                break;
            }
            case 'destroy': {
                command('unload');
                destroyed = true;
//                onPropChanged('subtitlesOffset');
//                onPropChanged('subtitlesSize');
//                onPropChanged('subtitlesTextColor');
//                onPropChanged('subtitlesBackgroundColor');
//                onPropChanged('subtitlesOutlineColor');
//                onPropChanged('volume');
//                onPropChanged('muted');
//                onPropChanged('playbackSpeed');
//                events.removeAllListeners();
                // videoElement.onerror = null;
                // videoElement.onended = null;
                // videoElement.onpause = null;
                // videoElement.onplay = null;
                // videoElement.ontimeupdate = null;
                // videoElement.ondurationchange = null;
                // videoElement.onwaiting = null;
                // videoElement.onseeking = null;
                // videoElement.onseeked = null;
                // videoElement.onstalled = null;
                // videoElement.onplaying = null;
                // videoElement.oncanplay = null;
                // videoElement.canplaythrough = null;
                // videoElement.onloadeddata = null;
                // videoElement.onvolumechange = null;
                // videoElement.onratechange = null;
                // videoElement.textTracks.onchange = null;
                containerElement.removeChild(objElement);
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
    props: ['stream', 'paused', 'time', 'duration', 'buffering'],
    commands: ['load', 'unload', 'destroy'],
    events: ['propValue', 'propChanged', 'ended', 'error']
};

module.exports = TizenVideo;
