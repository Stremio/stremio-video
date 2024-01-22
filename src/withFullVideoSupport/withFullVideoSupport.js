var EventEmitter = require('eventemitter3');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');

function withFullVideoSupport(Video) {
    function VideoOverwriteSupported(options) {
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
        var containerElement = options.containerElement;
        if (!(containerElement instanceof HTMLElement)) {
            throw new Error('Container element required to be instance of HTMLElement');
        }
        var events = new EventEmitter();
        var destroyed = false;

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
        function getProp(propName, videoPropValue) {
            switch (propName) {
                default: {
                    return videoPropValue;
                }
            }
        }
        function observeProp(propName) {
            switch (propName) {
                default: {
                    return false;
                }
            }
        }
        function setProp(propName, propValue) {
            switch (propName) {
                default: {
                    return false;
                }
            }
        }
        function command(commandName, commandArgs) {
            switch (commandName) {
                case 'load': {
                    command('unload');
                    return false;
                }
                case 'unload': {
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

    VideoOverwriteSupported.canPlayStream = function(stream) {
        return Promise.resolve(true);
    };

    VideoOverwriteSupported.manifest = {
        name: Video.manifest.name + 'WithFullVideoSupport',
        external: Video.manifest.external,
        props: Video.manifest.props.concat([])
            .filter(function(value, index, array) { return array.indexOf(value) === index; }),
        commands: Video.manifest.commands.concat(['load', 'unload', 'destroy'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; }),
        events: Video.manifest.events.concat(['propValue', 'propChanged', 'error'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; })
    };

    return VideoOverwriteSupported;
}

module.exports = withFullVideoSupport;
