var EventEmitter = require('eventemitter3');
var url = require('url');
var hat = require('hat');
var mergeWith = require('lodash.mergewith');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var deviceMediaCapabilities = require('../mediaCapabilities');
var convertStream = require('./convertStream');
var fetchVideoParams = require('./fetchVideoParams');
var ERROR = require('../error');

function withStreamingServer(Video) {
    function VideoWithStreamingServer(options) {
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

        var self = this;
        var loadArgs = null;
        var loaded = false;
        var actionsQueue = [];
        var videoParams = null;
        var events = new EventEmitter();
        var destroyed = false;
        var observedProps = {
            stream: false,
            videoParams: false
        };

        function flushActionsQueue() {
            while (actionsQueue.length > 0) {
                var action = actionsQueue.shift();
                self.dispatch.call(self, action);
            }
        }
        function onVideoError(error) {
            events.emit('error', error);
            if (error.critical) {
                command('unload');
            }
        }
        function onVideoPropEvent(eventName, propName, propValue) {
            events.emit(eventName, propName, getProp(propName, propValue));
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
        function getProp(propName, videoPropValue) {
            switch (propName) {
                case 'stream': {
                    return loadArgs !== null ? loadArgs.stream : null;
                }
                case 'videoParams': {
                    return videoParams;
                }
                default: {
                    return videoPropValue;
                }
            }
        }
        function observeProp(propName) {
            switch (propName) {
                case 'stream':
                case 'videoParams': {
                    events.emit('propValue', propName, getProp(propName, null));
                    observedProps[propName] = true;
                    return true;
                }
                default: {
                    return false;
                }
            }
        }
        function command(commandName, commandArgs) {
            switch (commandName) {
                case 'load': {
                    if (commandArgs && commandArgs.stream && typeof commandArgs.streamingServerURL === 'string') {
                        command('unload');
                        video.dispatch({ type: 'command', commandName: 'unload' });
                        loadArgs = commandArgs;
                        onPropChanged('stream');
                        convertStream(commandArgs.streamingServerURL, commandArgs.stream, commandArgs.seriesInfo)
                            .then(function(result) {
                                var mediaURL = result.url;
                                var infoHash = result.infoHash;
                                var fileIdx = result.fileIdx;
                                var mediaCapabilities =  mergeWith({}, deviceMediaCapabilities, commandArgs.mediaCapabilities)
                                var canPlayStreamOptions = Object.assign({}, commandArgs, {
                                    mediaCapabilities: mediaCapabilities
                                });
                                return (commandArgs.forceTranscoding ? Promise.resolve(false) : VideoWithStreamingServer.canPlayStream({ url: mediaURL }, canPlayStreamOptions))
                                    .catch(function(error) {
                                        console.warn('Media probe error', error);
                                        return false;
                                    })
                                    .then(function(canPlay) {
                                        if (canPlay) {
                                            return {
                                                mediaURL: mediaURL,
                                                infoHash: infoHash,
                                                fileIdx: fileIdx,
                                                stream: {
                                                    url: mediaURL
                                                }
                                            };
                                        }

                                        var id = hat();
                                        var queryParams = new URLSearchParams([['mediaURL', mediaURL]]);
                                        if (commandArgs.forceTranscoding) {
                                            queryParams.set('forceTranscoding', '1');
                                        }

                                        var videoCodecs = Object.keys(mediaCapabilities).reduce(function(result, format) {
                                            return result.concat(mediaCapabilities[format].videoCodecs);
                                        }, []);
                                        videoCodecs.forEach(function(videoCodec) {
                                            queryParams.append('videoCodecs', videoCodec);
                                        });

                                        var audioCodecs = Object.keys(mediaCapabilities).reduce(function(result, format) {
                                            return result.concat(mediaCapabilities[format].audioCodecs);
                                        }, []);
                                        audioCodecs.forEach(function(audioCodec) {
                                            queryParams.append('audioCodecs', audioCodec);
                                        });

                                        const maxAudioChannels = Object.keys(mediaCapabilities).reduce(function(result, format) {
                                            return Math.max(result, mediaCapabilities[format].maxAudioChannels);
                                        }, 2);
                                        queryParams.set('maxAudioChannels', maxAudioChannels);

                                        return {
                                            mediaURL: mediaURL,
                                            infoHash: infoHash,
                                            fileIdx: fileIdx,
                                            stream: {
                                                url: url.resolve(commandArgs.streamingServerURL, '/hlsv2/' + id + '/master.m3u8?' + queryParams.toString()),
                                                subtitles: Array.isArray(commandArgs.stream.subtitles) ?
                                                    commandArgs.stream.subtitles.map(function(track) {
                                                        return Object.assign({}, track, {
                                                            url: typeof track.url === 'string' ?
                                                                url.resolve(commandArgs.streamingServerURL, '/subtitles.vtt?' + new URLSearchParams([['from', track.url]]).toString())
                                                                :
                                                                track.url
                                                        });
                                                    })
                                                    :
                                                    [],
                                                behaviorHints: {
                                                    headers: {
                                                        'content-type': 'application/vnd.apple.mpegurl'
                                                    }
                                                }
                                            }
                                        };
                                    });
                            })
                            .then(function(result) {
                                if (commandArgs !== loadArgs) {
                                    return;
                                }

                                video.dispatch({
                                    type: 'command',
                                    commandName: 'load',
                                    commandArgs: Object.assign({}, commandArgs, {
                                        stream: result.stream
                                    })
                                });
                                loaded = true;
                                flushActionsQueue();
                                fetchVideoParams(commandArgs.streamingServerURL, result.mediaURL, result.infoHash, result.fileIdx, commandArgs.stream.behaviorHints)
                                    .then(function(result) {
                                        if (commandArgs !== loadArgs) {
                                            return;
                                        }

                                        videoParams = result;
                                        onPropChanged('videoParams');
                                    })
                                    .catch(function(error) {
                                        if (commandArgs !== loadArgs) {
                                            return;
                                        }

                                        // eslint-disable-next-line no-console
                                        console.error(error);
                                        videoParams = { hash: null, size: null, filename: null };
                                        onPropChanged('videoParams');
                                    });
                            })
                            .catch(function(error) {
                                if (commandArgs !== loadArgs) {
                                    return;
                                }

                                onError(Object.assign({}, ERROR.WITH_STREAMING_SERVER.CONVERT_FAILED, {
                                    error: error,
                                    critical: true,
                                    stream: commandArgs.stream,
                                    streamingServerURL: commandArgs.streamingServerURL
                                }));
                            });
                    } else {
                        onError(Object.assign({}, ERROR.UNSUPPORTED_STREAM, {
                            critical: true,
                            stream: commandArgs ? commandArgs.stream : null,
                            streamingServerURL: commandArgs && typeof commandArgs.streamingServerURL === 'string' ? commandArgs.streamingServerURL : null
                        }));
                    }

                    return true;
                }
                case 'addExtraSubtitlesTracks': {
                    if (loadArgs && commandArgs && Array.isArray(commandArgs.tracks)) {
                        if (loaded) {
                            video.dispatch({
                                type: 'command',
                                commandName: 'addExtraSubtitlesTracks',
                                commandArgs: Object.assign({}, commandArgs, {
                                    tracks: commandArgs.tracks.map(function(track) {
                                        return Object.assign({}, track, {
                                            url: typeof track.url === 'string' ?
                                                url.resolve(loadArgs.streamingServerURL, '/subtitles.vtt?' + new URLSearchParams([['from', track.url]]).toString())
                                                :
                                                track.url
                                        });
                                    })
                                })
                            });
                        } else {
                            actionsQueue.push({
                                type: 'command',
                                commandName: 'addExtraSubtitlesTracks',
                                commandArgs: commandArgs
                            });
                        }
                    }

                    return true;
                }
                case 'unload': {
                    loadArgs = null;
                    loaded = false;
                    actionsQueue = [];
                    videoParams = null;
                    onPropChanged('stream');
                    onPropChanged('videoParams');
                    return false;
                }
                case 'destroy': {
                    command('unload');
                    destroyed = true;
                    video.dispatch({ type: 'command', commandName: 'destroy' });
                    events.removeAllListeners();
                    return true;
                }
                default: {
                    if (!loaded) {
                        actionsQueue.push({
                            type: 'command',
                            commandName: commandName,
                            commandArgs: commandArgs
                        });

                        return true;
                    }

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

    VideoWithStreamingServer.canPlayStream = function(stream, options) {
        return Video.canPlayStream(stream)
            .then(function(canPlay) {
                if (!canPlay) {
                    throw new Error('Fallback using /hlsv2/probe');
                }

                return canPlay;
            })
            .catch(function() {
                var queryParams = new URLSearchParams([['mediaURL', stream.url]]);
                return fetch(url.resolve(options.streamingServerURL, '/hlsv2/probe?' + queryParams.toString()))
                    .then(function(resp) {
                        return resp.json();
                    })
                    .then(function(probe) {
                        var format = options.mediaCapabilities[probe.format.name]
                        if (!format) {
                            return false;
                        }

                        var videoStreams = probe.streams.filter(function(stream) {
                            return stream.track === 'video';
                        });
                        var areVideoStreamsSupported = videoStreams.length === 0 || videoStreams.some(function(stream) {
                            return format.videoCodecs.indexOf(stream.codec) !== -1;
                        });
                        var audioStreams = probe.streams.filter(function(stream) {
                            return stream.track === 'audio';
                        });
                        var areAudioStreamsSupported = audioStreams.length === 0 || audioStreams.some(function(stream) {
                            return stream.channels <= format.maxAudioChannels &&
                                format.audioCodecs.indexOf(stream.codec) !== -1;
                        });
                        return areVideoStreamsSupported && areAudioStreamsSupported;
                    });
            });
    };

    VideoWithStreamingServer.manifest = {
        name: Video.manifest.name + 'WithStreamingServer',
        external: Video.manifest.external,
        props: Video.manifest.props.concat(['stream', 'videoParams'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; }),
        commands: Video.manifest.commands.concat(['load', 'unload', 'destroy', 'addExtraSubtitlesTracks'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; }),
        events: Video.manifest.events.concat(['propValue', 'propChanged', 'error'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; })
    };

    return VideoWithStreamingServer;
}

module.exports = withStreamingServer;
