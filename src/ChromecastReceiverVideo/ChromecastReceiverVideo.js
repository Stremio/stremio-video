var EventEmitter = require('events');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');

function ChromecastReceiverVideo(options) {
    options = options || {};

    var selectVideoImplementation = options.selectVideoImplementation;
    if (typeof selectVideoImplementation !== 'function') {
        throw new Error('selectVideoImplementation argument required');
    }

    var destroyed = false;
    var actionsQueue = [];
    var video = null;

    var events = new EventEmitter();
    events.on('error', function() { });

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
            if (action.type === 'command' && action.commandName === 'load') {
                if (action.commandArgs) {
                    var Video = selectVideoImplementation(action.commandArgs);
                    if (video !== null && video.constructor !== Video) {
                        video.dispatch({ type: 'command', commandName: 'destroy' });
                        video = null;
                    }
                    if (video === null) {
                        video = new Video(options);
                        video.on('ended', function() {
                            events.emit('ended');
                        });
                        video.on('error', function(args) {
                            events.emit('error', args);
                        });
                        video.on('propValue', function(propName, propValue) {
                            events.emit('propValue', propName, propValue);
                        });
                        video.on('propChanged', function(propName, propValue) {
                            events.emit('propChanged', propName, propValue);
                        });
                        video.on('subtitlesTrackLoaded', function(track) {
                            events.emit('subtitlesTrackLoaded', track);
                        });
                        video.on('extraSubtitlesTrackLoaded', function(track) {
                            events.emit('extraSubtitlesTrackLoaded', track);
                        });
                        actionsQueue.forEach(function(action) {
                            video.dispatch(action);
                        });
                        actionsQueue = [];
                    }
                } else {
                    actionsQueue = [];
                    if (video !== null) {
                        video.dispatch({ type: 'command', commandName: 'destroy' });
                        video = null;
                    }

                    return;
                }
            }

            if (video !== null) {
                video.dispatch(action);
            } else {
                actionsQueue.push(action);
            }

            if (action.type === 'command' && action.commandName === 'destroy') {
                destroyed = true;
                events.removeAllListeners();
                events.on('error', function() { });
            }

            return;
        }

        throw new Error('Invalid action dispatched: ' + JSON.stringify(action));
    };
}

ChromecastReceiverVideo.canPlayStream = function() {
    return Promise.resolve(true);
};

ChromecastReceiverVideo.manifest = {
    name: 'ChromecastReceiverVideo',
    props: ['stream', 'paused', 'time', 'duration', 'buffering', 'buffered', 'volume', 'muted', 'subtitlesTracks', 'selectedSubtitlesTrackId', 'extraSubtitlesTracks', 'selectedExtraSubtitlesTrackId', 'extraSubtitlesDelay', 'extraSubtitlesSize', 'extraSubtitlesOffset', 'extraSubtitlesTextColor', 'extraSubtitlesBackgroundColor', 'extraSubtitlesShadowColor'],
    commands: ['load', 'unload', 'destroy', 'addExtraSubtitlesTracks'],
    events: ['propChanged', 'propValue', 'ended', 'error', 'subtitlesTrackLoaded', 'extraSubtitlesTrackLoaded']
};

module.exports = ChromecastReceiverVideo;
