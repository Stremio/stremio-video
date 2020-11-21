var EventEmitter = require('events');
var url = require('url');
var convertStream = require('./convertStream');
var ERROR = require('../error');

var BUFFERING_OFFSET = 25000;

function withStreamingServer(Video) {
    function VideoWithStreamingServer(options) {
        options = options || {};

        var video = new Video(options);
        video.on('propChanged', onPropChanged);
        video.on('propValue', onPropValue);
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
        var loadArgs = null;
        var transcodingParams = null;
        var time = null;
        var duration = null;

        function nextSegment() {
            if (transcodingParams !== null && !transcodingParams.ended && transcodingParams.loadingDuration !== duration && time !== null && duration !== null && time + BUFFERING_OFFSET > duration) {
                transcodingParams.loadingDuration = duration;
                transcodingParams.loadingTime = time;
                var loadingTranscodingParams = transcodingParams;
                fetch(url.resolve(transcodingParams.streamingServerURL, '/transcode/next') + '?' + new URLSearchParams([['hash', transcodingParams.hash]]).toString())
                    .then(function(resp) {
                        return resp.json();
                    })
                    .then(function(resp) {
                        if (loadingTranscodingParams !== transcodingParams) {
                            return;
                        }

                        if (resp.error) {
                            if (resp.error.code !== 6) {
                                throw resp.error;
                            }

                            command('load', Object.assign({}, loadArgs, {
                                time: transcodingParams.loadingTime
                            }));
                            return;
                        }

                        transcodingParams.ended = !!resp.ended;
                    })
                    .catch(function(error) {
                        if (loadingTranscodingParams !== transcodingParams) {
                            return;
                        }

                        onError(Object.assign({}, ERROR.WITH_STREAMING_SERVER.TRANSCODING_FAILED, {
                            critical: true,
                            error: error
                        }));
                    });
            }
        }
        function onPropChanged(propName, propValue) {
            events.emit('propChanged', propName, getProp(propName, propValue));
            switch (propName) {
                case 'time': {
                    time = propValue;
                    nextSegment();
                    break;
                }
                case 'duration': {
                    duration = propValue;
                    nextSegment();
                    break;
                }
            }
        }
        function onPropValue(propName, propValue) {
            events.emit('propValue', propName, getProp(propName, propValue));
            switch (propName) {
                case 'time': {
                    time = propValue;
                    nextSegment();
                    break;
                }
                case 'duration': {
                    duration = propValue;
                    nextSegment();
                    break;
                }
            }
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
                    return propValue !== null && transcodingParams !== null ?
                        propValue + transcodingParams.time
                        :
                        propValue;
                }
                case 'duration': {
                    return propValue !== null && transcodingParams !== null ?
                        transcodingParams.duration
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
                    if (loadArgs && transcodingParams !== null && propValue !== null && isFinite(propValue)) {
                        var commandArgs = Object.assign({}, loadArgs, {
                            time: parseInt(propValue)
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
                    command('unload');
                    video.dispatch({ type: 'command', commandName: 'unload' });
                    if (commandArgs && commandArgs.stream && typeof commandArgs.streamingServerURL === 'string') {
                        loadArgs = commandArgs;
                        convertStream(commandArgs.streamingServerURL, commandArgs.stream)
                            .then(function(videoURL) {
                                return (commandArgs.forceTranscoding ? Promise.resolve(false) : Video.canPlayStream({ url: videoURL }))
                                    .then(function(canPlay) {
                                        if (canPlay) {
                                            return {
                                                loadArgsExt: {
                                                    stream: {
                                                        url: videoURL
                                                    }
                                                }
                                            };
                                        }

                                        var time = commandArgs.time !== null && isFinite(commandArgs.time) ? parseInt(commandArgs.time) : 0;
                                        return fetch(url.resolve(commandArgs.streamingServerURL, '/transcode/create') + '?' + new URLSearchParams([['url', videoURL], ['time', time]]).toString())
                                            .then(function(resp) {
                                                return resp.json();
                                            })
                                            .then(function(resp) {
                                                if (resp.error) {
                                                    throw resp.error;
                                                }

                                                return {
                                                    transcodingParams: {
                                                        time: time,
                                                        hash: resp.hash,
                                                        duration: resp.duration,
                                                        streamingServerURL: commandArgs.streamingServerURL
                                                    },
                                                    loadArgsExt: {
                                                        time: 0,
                                                        stream: {
                                                            url: url.resolve(commandArgs.streamingServerURL, 'transcode/' + resp.hash + '/playlist.m3u8')
                                                        }
                                                    }
                                                };
                                            });
                                    })
                                    .catch(function(error) {
                                        throw Object.assign({}, ERROR.UNKNOWN_ERROR, {
                                            critical: true,
                                            error: error
                                        });
                                    });
                            })
                            .then(function(result) {
                                if (commandArgs !== loadArgs) {
                                    return;
                                }

                                transcodingParams = result.transcodingParams;
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

                                onError(error);
                            });
                    }

                    return true;
                }
                case 'unload': {
                    loadArgs = null;
                    transcodingParams = null;
                    time = null;
                    duration = null;
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
            if (!destroyed) {
                events.on(eventName, listener);
            }
        };
        this.dispatch = function(action) {
            if (!destroyed && action) {
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
