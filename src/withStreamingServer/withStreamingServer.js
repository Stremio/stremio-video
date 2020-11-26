var EventEmitter = require('events');
var convertStreamToURL = require('./convertStreamToURL');
var createTranscoder = require('./createTranscoder');
var transcodeNextSegment = require('./transcodeNextSegment');
var ERROR = require('../error');

var BUFFERING_OFFSET = 25000;
var STARVATION_TIMEOUT = 1000;

function withStreamingServer(Video) {
    function VideoWithStreamingServer(options) {
        options = options || {};

        var video = new Video(options);
        video.on('propChanged', onPropEvent.bind(null, 'propChanged'));
        video.on('propValue', onPropEvent.bind(null, 'propValue'));
        Video.manifest.events
            .filter(function(eventName) {
                return !['propChanged', 'propValue'].includes(eventName);
            })
            .forEach(function(eventName) {
                video.on(eventName, onOtherEvent(eventName));
            });

        var events = new EventEmitter();
        events.on('error', function() { });

        var destroyed = false;
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
                videoState.time + BUFFERING_OFFSET > videoState.duration;
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
                        if (resp.error.code !== 6) {
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
        function onError(error) {
            events.emit('error', error);
            if (error.critical) {
                command('unload');
                video.dispatch({ type: 'command', commandName: 'unload' });
            }
        }
        function getProp(propName, propValue) {
            switch (propName) {
                case 'time': {
                    return propValue !== null && transcoder !== null ?
                        propValue + transcoder.time
                        :
                        propValue;
                }
                case 'duration': {
                    return transcoder !== null ?
                        transcoder.duration
                        :
                        propValue;
                }
                case 'buffered': {
                    return propValue !== null && transcoder !== null ?
                        propValue + transcoder.time
                        :
                        propValue;
                }
                default: {
                    return propValue;
                }
            }
        }
        function setProp(propName, propValue) {
            switch (propName) {
                case 'time': {
                    if (loadArgs && transcoder !== null && propValue !== null && isFinite(propValue)) {
                        var commandArgs = Object.assign({}, loadArgs, {
                            time: parseInt(propValue, 10)
                        });
                        command('load', commandArgs);
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
                        convertStreamToURL(commandArgs.streamingServerURL, commandArgs.stream)
                            .then(function(videoURL) {
                                return (commandArgs.forceTranscoding ? Promise.resolve(false) : Video.canPlayStream({ url: videoURL }))
                                    .catch(function(error) {
                                        throw Object.assign({}, ERROR.UNKNOWN_ERROR, {
                                            error: error
                                        });
                                    })
                                    .then(function(canPlay) {
                                        if (canPlay) {
                                            return {
                                                transcoder: null,
                                                loadArgsExt: {
                                                    stream: {
                                                        url: videoURL
                                                    }
                                                }
                                            };
                                        }

                                        var time = commandArgs.time !== null && isFinite(commandArgs.time) ? parseInt(commandArgs.time, 10) : 0;
                                        return createTranscoder(commandArgs.streamingServerURL, videoURL, time)
                                            .then(function(transcoder) {
                                                return {
                                                    transcoder: transcoder,
                                                    loadArgsExt: {
                                                        time: 0,
                                                        stream: {
                                                            url: transcoder.url
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
                            stream: commandArgs && commandArgs.stream ? commandArgs.stream : null
                        }));
                    }

                    return true;
                }
                case 'unload': {
                    clearTimeout(starvationHandlerTimeoutId);
                    videoState = {
                        time: null,
                        duration: null
                    };
                    loadArgs = null;
                    transcoder = null;
                    transcodingNextSegment = false;
                    lastStarvationDuration = null;
                    starvationHandlerTimeoutId = null;
                    return false;
                }
                case 'destroy': {
                    command('unload');
                    destroyed = true;
                    events.removeAllListeners();
                    events.on('error', function() { });
                    return false;
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
                switch (action.type) {
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
        props: Video.manifest.props,
        events: Video.manifest.events.concat(['error'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; })
    };

    return VideoWithStreamingServer;
}

module.exports = withStreamingServer;
