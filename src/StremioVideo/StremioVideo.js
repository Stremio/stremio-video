var EventEmitter = require('eventemitter3');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');

function StremioVideo(options) {
    options = options || {};

    var selectVideoImplementation = options.selectVideoImplementation;
    if (typeof selectVideoImplementation !== 'function') {
        throw new Error('selectVideoImplementation argument required');
    }

    var destroyed = false;
    var video = null;

    var events = new EventEmitter();

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
            if (action.type === 'command' && action.commandName === 'load' && action.commandArgs) {
                var Video = selectVideoImplementation(action.commandArgs);
                if (video !== null && video.constructor !== Video) {
                    video.dispatch({ type: 'command', commandName: 'destroy' });
                    video = null;
                }
                if (video === null) {
                    video = new Video(Object.assign({}, options, action.commandArgs));
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
                    if (Video.manifest.external) {
                        video.on('implementationChanged', function(manifest) {
                            events.emit('implementationChanged', manifest);
                        });
                    } else {
                        events.emit('implementationChanged', Video.manifest);
                    }
                }
            }

            if (video !== null) {
                try {
                    video.dispatch(action);
                } catch (error) {
                    // eslint-disable-next-line no-console
                    console.error(video.constructor.manifest.name, error);
                }
            }

            if (action.type === 'command' && action.commandName === 'destroy') {
                destroyed = true;
                events.removeAllListeners();
            }

            return;
        }

        throw new Error('Invalid action dispatched: ' + JSON.stringify(action));
    };
}

module.exports = StremioVideo;
