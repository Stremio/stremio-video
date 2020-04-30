var EventEmitter = require('events');
var url = require('url');
var magnet = require('magnet-uri')
var createTorrent = require('./createTorrent');
var guessFileIdx = require('./guessFileIdx');

var CONVERT_FAILED_CODE = 85;

function withStreamingServer(Video) {
    function VideoWithStreamingServer(options) {
        options = options || {};
        var video = new Video(options);

        var events = new EventEmitter();
        events.on('error', function() { });

        var destroyed = false;
        var stream = null;

        function convertStream(streamingServerURL, stream) {
            return new Promise(function(resolve, reject) {
                if (typeof stream.url === 'string') {
                    if (stream.url.indexOf('magnet:') === 0) {
                        var parsedMagnetURI
                        try {
                            parsedMagnetURI = magnet.decode(stream.url);
                        } catch (e) { }
                        if (parsedMagnetURI && typeof parsedMagnetURI.infoHash === 'string') {
                            var sources = Array.isArray(parsedMagnetURI.announce) ?
                                parsedMagnetURI.announce.map(function(source) {
                                    return 'tracker:' + source;
                                })
                                :
                                [];
                            createTorrent(streamingServerURL, parsedMagnetURI.infoHash, sources)
                                .then(function(resp) {
                                    var fileIdx = guessFileIdx(resp.files, stream.seriesInfo);
                                    resolve(url.resolve(streamingServerURL, `/${encodeURIComponent(stream.infoHash)}/${encodeURIComponent(fileIdx)}`));
                                })
                                .catch(function(error) {
                                    reject(Object.assign({}, error, {
                                        stream: stream
                                    }));
                                });
                            return;
                        }
                    } else {
                        resolve(stream.url);
                        return;
                    }
                }

                if (typeof stream.ytId === 'string') {
                    resolve(url.resolve(streamingServerURL, `/yt/${encodeURIComponent(stream.ytId)}?${new URLSearchParams([['request', Date.now()]])}`));
                    return;
                }

                if (typeof stream.infoHash === 'string') {
                    if (stream.fileIdx !== null && isFinite(stream.fileIdx)) {
                        resolve(url.resolve(streamingServerURL, `/${encodeURIComponent(stream.infoHash)}/${encodeURIComponent(stream.fileIdx)}`));
                        return;
                    } else {
                        createTorrent(streamingServerURL, stream.infoHash, stream.sources)
                            .then(function(resp) {
                                var fileIdx = guessFileIdx(resp.files, stream.seriesInfo);
                                resolve(url.resolve(streamingServerURL, `/${encodeURIComponent(stream.infoHash)}/${encodeURIComponent(fileIdx)}`));
                            })
                            .catch(function(error) {
                                reject(Object.assign({}, error, {
                                    stream: stream
                                }));
                            });
                        return;
                    }
                }

                reject({
                    code: CONVERT_FAILED_CODE,
                    message: 'Unable to convert stream',
                    critical: true,
                    stream: stream
                });
            });
        }
        function onError(error) {
            events.emit('error', error);
            if (error.critical) {
                command('unload');
                video.dispatch({ type: 'command', commandName: 'unload' });
            }
        }
        function command(commandName, commandArgs) {
            switch (commandName) {
                case 'load': {
                    command('unload');
                    video.dispatch({ type: 'command', commandName: 'unload' });
                    if (commandArgs && commandArgs.stream && typeof commandArgs.streamingServerURL === 'string') {
                        stream = commandArgs.stream;
                        convertStream(commandArgs.streamingServerURL, commandArgs.stream)
                            .then(function(convertedURL) {
                                if (commandArgs.stream !== stream) {
                                    return;
                                }

                                video.dispatch({
                                    type: 'command',
                                    commandName: 'load',
                                    commandArgs: Object.assign({}, commandArgs, {
                                        stream: Object.assign({}, commandArgs.stream, {
                                            url: convertedURL
                                        })
                                    })
                                });
                            })
                            .catch(function(error) {
                                if (commandArgs.stream !== stream) {
                                    return;
                                }

                                onError(error);
                            });
                    }

                    return true;
                }
                case 'unload': {
                    stream = null;
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
                    case 'command': {
                        var handled = command(action.commandName, action.commandArgs);
                        if (handled) {
                            return;
                        }

                        break;
                    }
                }
            }

            video.dispatch(action);
        };
    }

    VideoWithStreamingServer.manifest = {
        name: Video.manifest.name + 'WithStreamingServer',
        embedded: Video.manifest.embedded,
        props: Video.manifest.props
    };

    return VideoWithStreamingServer;
}

module.exports = withStreamingServer;
