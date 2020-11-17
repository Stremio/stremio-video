var EventEmitter = require('events');
var url = require('url');
var convertStream = require('./convertStream');
var ERROR = require('../error');

function withStreamingServer(Video) {
    function VideoWithStreamingServer(options) {
        options = options || {};

        var video = new Video(options);

        var events = new EventEmitter();
        events.on('error', function() { });

        var destroyed = false;
        var loadCommandArgs = null;
        var transcodingHash = null;

        function onError(error) {
            events.emit('error', error);
            if (error.critical) {
                command('unload');
                video.dispatch({ type: 'command', commandName: 'unload' });
            }
        }
        function setProp(propName, propValue) {
            switch (propName) {
                case 'time': {
                    if (loadCommandArgs && transcodingHash !== null && propValue !== null && isFinite(propValue)) {
                        var commandArgs = Object.assign({}, loadCommandArgs, {
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
                        loadCommandArgs = commandArgs;
                        convertStream(commandArgs.streamingServerURL, commandArgs.stream)
                            .then(function(videoURL) {
                                return (commandArgs.forceTranscoding ? Promise.resolve(false) : Video.canPlayStream({ url: videoURL }))
                                    .then(function(canPlay) {
                                        if (canPlay) {
                                            return {
                                                loadCommandArgsExt: {
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
                                                return {
                                                    hash: resp.hash,
                                                    loadCommandArgsExt: {
                                                        time: 0,
                                                        duration: resp.duration,
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
                                if (commandArgs !== loadCommandArgs) {
                                    return;
                                }

                                transcodingHash = result.hash;
                                video.dispatch({
                                    type: 'command',
                                    commandName: 'load',
                                    commandArgs: Object.assign({}, commandArgs, result.loadCommandArgsExt)
                                });
                            })
                            .catch(function(error) {
                                if (commandArgs !== loadCommandArgs) {
                                    return;
                                }

                                onError(error);
                            });
                    }

                    return true;
                }
                case 'unload': {
                    loadCommandArgs = null;
                    transcodingHash = null;
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

            video.on(eventName, listener);
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
