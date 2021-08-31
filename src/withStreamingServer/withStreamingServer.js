var EventEmitter = require('eventemitter3');
var url = require('url');
var hat = require('hat');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var convertStream = require('./convertStream');
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
        var events = new EventEmitter();
        var destroyed = false;
        var observedProps = {
            stream: false
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
                default: {
                    return videoPropValue;
                }
            }
        }
        function observeProp(propName) {
            switch (propName) {
                case 'stream': {
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
                            .then(function(mediaURL) {
                                return (commandArgs.forceTranscoding ? Promise.resolve(false) : Video.canPlayStream({ url: mediaURL }))
                                    .catch(function() { return false; })
                                    .then(function(canPlay) {
                                        if (canPlay) {
                                            return {
                                                url: mediaURL
                                            };
                                        }

                                        var id = hat();
                                        var queryParams = new URLSearchParams([['mediaURL', mediaURL]]);
                                        if (commandArgs.forceTranscoding) {
                                            queryParams.set('forceTranscoding', '1');
                                        }
                                        if (commandArgs.audioChannels !== null && isFinite(commandArgs.audioChannels)) {
                                            queryParams.set('audioChannels', commandArgs.audioChannels);
                                        }

                                        return {
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
                                        };
                                    });
                            })
                            .then(function(stream) {
                                if (commandArgs !== loadArgs) {
                                    return;
                                }

                                video.dispatch({
                                    type: 'command',
                                    commandName: 'load',
                                    commandArgs: Object.assign({}, commandArgs, {
                                        stream: stream
                                    })
                                });
                                loaded = true;
                                flushActionsQueue();
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
                    onPropChanged('stream');
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

    VideoWithStreamingServer.canPlayStream = function(stream) {
        return Video.canPlayStream(stream);
    };

    VideoWithStreamingServer.manifest = {
        name: Video.manifest.name + 'WithStreamingServer',
        external: Video.manifest.external,
        props: Video.manifest.props.concat(['stream'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; }),
        commands: Video.manifest.commands.concat(['load', 'unload', 'destroy', 'addExtraSubtitlesTracks'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; }),
        events: Video.manifest.events.concat(['propValue', 'propChanged', 'error'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; })
    };

    return VideoWithStreamingServer;
}

module.exports = withStreamingServer;
