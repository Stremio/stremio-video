var EventEmitter = require('events');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var subtitlesRenderer = require('./subtitlesRenderer');
var fetchSubtitles = require('./fetchSubtitles');

function withHTMLSubtitles(Video) {
    function VideoWithHTMLSubtitles(options) {
        options = options || {};

        var video = new Video(options);

        var containerElement = options.containerElement;
        containerElement.style.position = 'relative';

        var subtitlesElement = document.createElement('div');
        subtitlesElement.style.position = 'absolute';
        subtitlesElement.style.right = '0';
        subtitlesElement.style.bottom = '0';
        subtitlesElement.style.left = '0';
        subtitlesElement.style.zIndex = '1';
        subtitlesElement.style.textAlign = 'center';
        containerElement.appendChild(subtitlesElement);

        var events = new EventEmitter();
        events.on('error', function() { });

        video.on('propValue', onVideoPropEvent.bind(null, 'propValue'));
        video.on('propChanged', onVideoPropEvent.bind(null, 'propChanged'));
        Video.manifest.events
            .filter(function(eventName) {
                return !['propChanged', 'propValue'].includes(eventName);
            })
            .forEach(function(eventName) {
                video.on(eventName, onVideoOtherEvent(eventName));
            });

        var destroyed = false;
        var videoState = {
            time: null
        };
        var cuesByTime = null;
        var tracks = [];
        var selectedTrackId = null;
        var delay = null;
        var size = 100;
        var offset = 0;
        var textColor = '#FFFFFFFF';
        var backgroundColor = '#00000000';
        var shadowColor = '#222222FF';
        var observedProps = {
            subtitlesTracks: false,
            selectedSubtitlesTrackId: false,
            subtitlesDelay: false,
            subtitlesSize: false,
            subtitlesOffset: false,
            subtitlesTextColor: false,
            subtitlesBackgroundColor: false,
            subtitlesShadowColor: false
        };

        function renderSubtitles() {
            while (subtitlesElement.hasChildNodes()) {
                subtitlesElement.removeChild(subtitlesElement.lastChild);
            }

            if (cuesByTime === null || videoState.time === null || !isFinite(videoState.time)) {
                return;
            }

            subtitlesElement.style.bottom = offset + '%';
            subtitlesRenderer.render(cuesByTime, videoState.time + delay)
                .map(function(cueNode) {
                    cueNode.style.display = 'inline-block';
                    cueNode.style.padding = '0.2em';
                    cueNode.style.fontSize = Math.floor(size / 25) + 'vmin';
                    cueNode.style.color = textColor;
                    cueNode.style.backgroundColor = backgroundColor;
                    cueNode.style.textShadow = '1px 1px 0.1em ' + shadowColor;
                    return cueNode;
                })
                .forEach(function(cueNode) {
                    subtitlesElement.append(cueNode, document.createElement('br'));
                });
        }
        function getProp(propName, videoPropValue) {
            switch (propName) {
                case 'subtitlesTracks': {
                    if (destroyed) {
                        return null;
                    }

                    return tracks.slice();
                }
                case 'selectedSubtitlesTrackId': {
                    if (destroyed) {
                        return null;
                    }

                    return selectedTrackId;
                }
                case 'subtitlesDelay': {
                    if (destroyed) {
                        return null;
                    }

                    return delay;
                }
                case 'subtitlesSize': {
                    if (destroyed) {
                        return null;
                    }

                    return size;
                }
                case 'subtitlesOffset': {
                    if (destroyed) {
                        return null;
                    }

                    return offset;
                }
                case 'subtitlesTextColor': {
                    if (destroyed) {
                        return null;
                    }

                    return textColor;
                }
                case 'subtitlesBackgroundColor': {
                    if (destroyed) {
                        return null;
                    }

                    return backgroundColor;
                }
                case 'subtitlesShadowColor': {
                    if (destroyed) {
                        return null;
                    }

                    return shadowColor;
                }
                default: {
                    return videoPropValue;
                }
            }
        }
        function onError(error) {
            events.emit('error', error);
            if (error.critical) {
                command('unload');
                video.dispatch({ type: 'command', commandName: 'unload' });
            }
        }
        function onVideoPropEvent(eventName, propName, propValue) {
            switch (propName) {
                case 'time': {
                    videoState.time = propValue;
                    renderSubtitles();
                    break;
                }
            }

            events.emit(eventName, propName, getProp(propName, propValue));
        }
        function onVideoOtherEvent(eventName) {
            return function() {
                events.emit.apply(events, [eventName].concat(Array.from(arguments)));
            };
        }
        function onPropChanged(propName) {
            if (observedProps[propName]) {
                events.emit('propChanged', propName, getProp(propName));
            }
        }
        function observeProp(propName) {
            switch (propName) {
                case 'subtitlesTracks':
                case 'selectedSubtitlesTrackId':
                case 'subtitlesDelay':
                case 'subtitlesSize':
                case 'subtitlesOffset':
                case 'subtitlesTextColor':
                case 'subtitlesBackgroundColor':
                case 'subtitlesShadowColor': {
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
                case 'selectedSubtitlesTrackId': {
                    selectedTrackId = null;
                    delay = null;
                    cuesByTime = null;
                    var selecterdTrack = tracks.find(function(track) {
                        return track.id === propValue;
                    });
                    if (selecterdTrack) {
                        selectedTrackId = selecterdTrack.id;
                        delay = 0;
                        cuesByTime = null;
                        fetchSubtitles(selecterdTrack)
                            .then(function(resp) {
                                if (selectedTrackId !== selecterdTrack.id) {
                                    return;
                                }

                                cuesByTime = resp;
                                renderSubtitles();
                                events.emit('subtitlesTrackLoaded', selecterdTrack);
                            })
                            .catch(function(error) {
                                if (selectedTrackId !== selecterdTrack.id) {
                                    return;
                                }

                                onError(Object.assign({}, error, {
                                    critical: false
                                }));
                            });
                    }

                    renderSubtitles();
                    onPropChanged('selectedSubtitlesTrackId');
                    onPropChanged('subtitlesDelay');
                    return true;
                }
                case 'subtitlesDelay': {
                    if (selectedTrackId !== null && propValue !== null && isFinite(propValue)) {
                        delay = parseInt(propValue, 10);
                        renderSubtitles();
                        onPropChanged('subtitlesDelay');
                    }

                    return true;
                }
                case 'subtitlesSize': {
                    if (propValue !== null && isFinite(propValue)) {
                        size = Math.max(0, parseInt(propValue, 10));
                        renderSubtitles();
                        onPropChanged('subtitlesSize');
                    }

                    return true;
                }
                case 'subtitlesOffset': {
                    if (propValue !== null && isFinite(propValue)) {
                        offset = Math.max(0, Math.min(100, parseInt(propValue, 10)));
                        renderSubtitles();
                        onPropChanged('subtitlesOffset');
                    }

                    return true;
                }
                case 'subtitlesTextColor': {
                    if (typeof propValue === 'string') {
                        textColor = propValue;
                        renderSubtitles();
                        onPropChanged('subtitlesTextColor');
                    }

                    return true;
                }
                case 'subtitlesBackgroundColor': {
                    if (typeof propValue === 'string') {
                        backgroundColor = propValue;
                        renderSubtitles();
                        onPropChanged('subtitlesBackgroundColor');
                    }

                    return true;
                }
                case 'subtitlesShadowColor': {
                    if (typeof propValue === 'string') {
                        shadowColor = propValue;
                        renderSubtitles();
                        onPropChanged('subtitlesShadowColor');
                    }

                    return true;
                }
                default: {
                    return false;
                }
            }
        }
        function command(commandName, commandArgs) {
            switch (commandName) {
                case 'addSubtitlesTracks': {
                    if (commandArgs && Array.isArray(commandArgs.tracks)) {
                        tracks = tracks
                            .concat(commandArgs.tracks)
                            .filter(function(track) {
                                return track &&
                                    typeof track.url === 'string' &&
                                    track.url.length > 0 &&
                                    typeof track.lang === 'string' &&
                                    track.lang.length > 0;
                            })
                            .map(function(track, index) {
                                return Object.freeze(Object.assign({}, track, {
                                    id: 'ext' + index
                                }));
                            });
                        onPropChanged('subtitlesTracks');
                    }

                    return true;
                }
                case 'load': {
                    command('unload');
                    return false;
                }
                case 'unload': {
                    cuesByTime = null;
                    tracks = [];
                    selectedTrackId = null;
                    delay = null;
                    renderSubtitles();
                    onPropChanged('subtitlesTracks');
                    onPropChanged('selectedSubtitlesTrackId');
                    onPropChanged('subtitlesDelay');
                    return false;
                }
                case 'destroy': {
                    command('unload');
                    destroyed = true;
                    onPropChanged('subtitlesSize');
                    onPropChanged('subtitlesOffset');
                    onPropChanged('subtitlesTextColor');
                    onPropChanged('subtitlesBackgroundColor');
                    onPropChanged('subtitlesShadowColor');
                    events.removeAllListeners();
                    events.on('error', function() { });
                    containerElement.removeChild(subtitlesElement);
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

            action = deepFreeze(cloneDeep(action));
            if (action) {
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

    VideoWithHTMLSubtitles.canPlayStream = function(stream) {
        return Video.canPlayStream(stream);
    };

    VideoWithHTMLSubtitles.manifest = {
        name: Video.manifest.name + 'WithHTMLSubtitles',
        props: Video.manifest.props.concat(['subtitlesTracks', 'selectedSubtitlesTrackId', 'subtitlesDelay', 'subtitlesSize', 'subtitlesOffset', 'subtitlesTextColor', 'subtitlesBackgroundColor', 'subtitlesShadowColor'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; }),
        commands: Video.manifest.commands.concat(['load', 'unload', 'destroy', 'addSubtitlesTracks'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; }),
        events: Video.manifest.events.concat(['propChanged', 'propValue', 'error', 'subtitlesTrackLoaded'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; })
    };

    return VideoWithHTMLSubtitles;
}

module.exports = withHTMLSubtitles;
