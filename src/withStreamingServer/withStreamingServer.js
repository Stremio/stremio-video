var EventEmitter = require('events');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var convertStreamToURL = require('./convertStreamToURL');
var createTranscoder = require('./createTranscoder');
var transcodeNextSegment = require('./transcodeNextSegment');
var ERROR = require('../error');

var STARVATION_THRESHOLD = 25000;
var STARVATION_TIMEOUT = 1000;

function withStreamingServer(Video) {
    function VideoWithStreamingServer(options) {
        options = options || {};

        var video = new Video(options);
        video.on('error', onError);
        video.on('propChanged', onPropEvent.bind(null, 'propChanged'));
        video.on('propValue', onPropEvent.bind(null, 'propValue'));
        Video.manifest.events
            .filter(function(eventName) {
                return !['error', 'propChanged', 'propValue'].includes(eventName);
            })
            .forEach(function(eventName) {
                video.on(eventName, onOtherEvent(eventName));
            });

        var events = new EventEmitter();
        events.on('error', function() { });

        var destroyed = false;
        var observedProps = {
            stream: false
        };
        var videoState = {
            time: null,
            duration: null
        };
        var loadArgs = null;
        var transcoder = null;
        var transcodingNextSegment = false;
        var lastStarvationDuration = null;
        var starvationHandlerTimeoutId = null;

        function isStarving() {
            return transcoder !== null &&
                !transcoder.ended &&
                !transcodingNextSegment &&
                starvationHandlerTimeoutId === null &&
                videoState.time !== null &&
                videoState.duration !== null &&
                videoState.duration !== lastStarvationDuration &&
                videoState.time + STARVATION_THRESHOLD > videoState.duration;
        }
        function onStarving() {
            transcodingNextSegment = true;
            lastStarvationDuration = videoState.duration;
            var loadingТranscoder = transcoder;
            transcodeNextSegment(transcoder.streamingServerURL, transcoder.hash)
                .then(function(resp) {
                    if (loadingТranscoder !== transcoder) {
                        return;
                    }

                    if (resp.error) {
                        if (resp.error.code !== 21) {
                            throw resp.error;
                        }

                        command('load', Object.assign({}, loadArgs, {
                            time: videoState.time
                        }));
                        return;
                    }

                    transcoder.ended = resp.ended;
                    transcodingNextSegment = false;
                    if (isStarving()) {
                        onStarving();
                    }
                })
                .catch(function(error) {
                    if (loadingТranscoder !== transcoder) {
                        return;
                    }

                    onError(Object.assign({}, ERROR.WITH_STREAMING_SERVER.TRANSCODING_FAILED, {
                        critical: true,
                        error: error
                    }));
                });
        }
        function onPropEvent(eventName, propName, propValue) {
            switch (propName) {
                case 'time': {
                    videoState.time = propValue;
                    if (isStarving()) {
                        onStarving();
                    }
                    break;
                }
                case 'duration': {
                    videoState.duration = propValue;
                    clearTimeout(starvationHandlerTimeoutId);
                    starvationHandlerTimeoutId = !transcodingNextSegment ?
                        setTimeout(function() {
                            starvationHandlerTimeoutId = null;
                            if (isStarving()) {
                                onStarving();
                            }
                        }, STARVATION_TIMEOUT)
                        :
                        null;
                    break;
                }
            }

            events.emit(eventName, propName, getProp(propName, propValue));
        }
        function onOtherEvent(eventName) {
            return function() {
                events.emit.apply(events, [eventName].concat(Array.from(arguments)));
            };
        }
        function onPropChanged(propName) {
            if (observedProps[propName]) {
                events.emit('propChanged', propName, getProp(propName));
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
                case 'time': {
                    return videoPropValue !== null && transcoder !== null ?
                        videoPropValue + transcoder.timeOffset
                        :
                        videoPropValue;
                }
                case 'duration': {
                    return transcoder !== null ?
                        transcoder.duration
                        :
                        videoPropValue;
                }
                case 'buffered': {
                    return videoPropValue !== null && transcoder !== null ?
                        videoPropValue + transcoder.timeOffset
                        :
                        videoPropValue;
                }
                default: {
                    return videoPropValue;
                }
            }
        }
        function observeProp(propName) {
            switch (propName) {
                case 'stream': {
                    events.emit('propValue', propName, getProp(propName));
                    observedProps[propName] = true;
                    return true;
                }
                default: {
                    return false;
                }
            }
        }
        function setProp(propName, propValue) {
            switch (propName) {
                case 'time': {
                    if (transcoder !== null) {
                        if (propValue !== null && isFinite(propValue)) {
                            var commandArgs = Object.assign({}, loadArgs, {
                                time: parseInt(propValue, 10)
                            });
                            command('load', commandArgs);
                        }

                        return true;
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
                case 'load': {
                    if (commandArgs && commandArgs.stream && typeof commandArgs.streamingServerURL === 'string') {
                        command('unload');
                        video.dispatch({ type: 'command', commandName: 'unload' });
                        loadArgs = commandArgs;
                        onPropChanged('stream');
                        convertStreamToURL(commandArgs.streamingServerURL, commandArgs.stream, commandArgs.seriesInfo)
                            .then(function(mediaURL) {
                                return (commandArgs.forceTranscoding ? Promise.resolve(false) : Video.canPlayStream({ url: mediaURL }))
                                    .catch(function(error) {
                                        throw Object.assign({}, ERROR.UNKNOWN_ERROR, {
                                            error: error,
                                            stream: commandArgs.stream
                                        });
                                    })
                                    .then(function(canPlay) {
                                        if (canPlay) {
                                            return {
                                                transcoder: null,
                                                loadArgsExt: {
                                                    stream: {
                                                        url: mediaURL
                                                    }
                                                }
                                            };
                                        }

                                        var time = commandArgs.time !== null && isFinite(commandArgs.time) ? parseInt(commandArgs.time, 10) : 0;
                                        return createTranscoder(commandArgs.streamingServerURL, mediaURL, time)
                                            .then(function(transcoder) {
                                                return {
                                                    transcoder: transcoder,
                                                    loadArgsExt: {
                                                        time: 0,
                                                        stream: {
                                                            url: transcoder.url,
                                                            behaviorHints: {
                                                                headers: {
                                                                    'content-type': 'application/vnd.apple.mpegurl'
                                                                }
                                                            }
                                                        }
                                                    }
                                                };
                                            });
                                    });
                            })
                            .then(function(result) {
                                if (commandArgs !== loadArgs) {
                                    return;
                                }

                                transcoder = result.transcoder;
                                video.dispatch({
                                    type: 'command',
                                    commandName: 'load',
                                    commandArgs: Object.assign({}, commandArgs, result.loadArgsExt)
                                });
                            })
                            .catch(function(error) {
                                if (commandArgs !== loadArgs) {
                                    return;
                                }

                                onError(Object.assign({}, error, {
                                    critical: true
                                }));
                            });
                    } else {
                        onError(Object.assign({}, ERROR.UNSUPPORTED_STREAM, {
                            critical: true,
                            stream: commandArgs ? commandArgs.stream : null
                        }));
                    }

                    return true;
                }
                case 'unload': {
                    clearTimeout(starvationHandlerTimeoutId);
                    loadArgs = null;
                    transcoder = null;
                    transcodingNextSegment = false;
                    lastStarvationDuration = null;
                    starvationHandlerTimeoutId = null;
                    onPropChanged('stream');
                    return false;
                }
                case 'destroy': {
                    command('unload');
                    destroyed = true;
                    video.dispatch({ type: 'command', commandName: 'destroy' });
                    events.removeAllListeners();
                    events.on('error', function() { });
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

    VideoWithStreamingServer.canPlayStream = function(stream) {
        return Video.canPlayStream(stream);
    };

    VideoWithStreamingServer.manifest = {
        name: Video.manifest.name + 'WithStreamingServer',
        external: Video.manifest.external,
        props: Video.manifest.props.concat(['stream'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; }),
        commands: Video.manifest.commands.concat(['load', 'unload', 'destroy'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; }),
        events: Video.manifest.events.concat(['error'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; })
    };

    return VideoWithStreamingServer;
}

module.exports = withStreamingServer;
