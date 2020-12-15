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
        if (!(containerElement instanceof HTMLElement)) {
            throw new Error('Container element required to be instance of HTMLElement');
        }

        var subtitlesElement = document.createElement('div');
        subtitlesElement.style.position = 'absolute';
        subtitlesElement.style.right = '0';
        subtitlesElement.style.bottom = '0';
        subtitlesElement.style.left = '0';
        subtitlesElement.style.zIndex = '1';
        subtitlesElement.style.textAlign = 'center';
        containerElement.style.position = 'relative';
        containerElement.appendChild(subtitlesElement);

        var events = new EventEmitter();
        events.on('error', function() { });

        video.on('error', onVideoError);
        video.on('propValue', onVideoPropEvent.bind(null, 'propValue'));
        video.on('propChanged', onVideoPropEvent.bind(null, 'propChanged'));
        Video.manifest.events
            .filter(function(eventName) {
                return !['error', 'propChanged', 'propValue'].includes(eventName);
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
            extraSubtitlesTracks: false,
            selectedExtraSubtitlesTrackId: false,
            extraSubtitlesDelay: false,
            extraSubtitlesSize: false,
            extraSubtitlesOffset: false,
            extraSubtitlesTextColor: false,
            extraSubtitlesBackgroundColor: false,
            extraSubtitlesShadowColor: false
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
                case 'extraSubtitlesTracks': {
                    if (destroyed) {
                        return [];
                    }

                    return tracks.slice();
                }
                case 'selectedExtraSubtitlesTrackId': {
                    if (destroyed) {
                        return null;
                    }

                    return selectedTrackId;
                }
                case 'extraSubtitlesDelay': {
                    if (destroyed) {
                        return null;
                    }

                    return delay;
                }
                case 'extraSubtitlesSize': {
                    if (destroyed) {
                        return null;
                    }

                    return size;
                }
                case 'extraSubtitlesOffset': {
                    if (destroyed) {
                        return null;
                    }

                    return offset;
                }
                case 'extraSubtitlesTextColor': {
                    if (destroyed) {
                        return null;
                    }

                    return textColor;
                }
                case 'extraSubtitlesBackgroundColor': {
                    if (destroyed) {
                        return null;
                    }

                    return backgroundColor;
                }
                case 'extraSubtitlesShadowColor': {
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
        function onVideoError(error) {
            events.emit('error', error);
            if (error.critical) {
                command('unload');
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
                case 'extraSubtitlesTracks':
                case 'selectedExtraSubtitlesTrackId':
                case 'extraSubtitlesDelay':
                case 'extraSubtitlesSize':
                case 'extraSubtitlesOffset':
                case 'extraSubtitlesTextColor':
                case 'extraSubtitlesBackgroundColor':
                case 'extraSubtitlesShadowColor': {
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
                case 'selectedExtraSubtitlesTrackId': {
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
                                events.emit('extraSubtitlesTrackLoaded', selecterdTrack);
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
                    onPropChanged('selectedExtraSubtitlesTrackId');
                    onPropChanged('extraSubtitlesDelay');
                    return true;
                }
                case 'extraSubtitlesDelay': {
                    if (selectedTrackId !== null && propValue !== null && isFinite(propValue)) {
                        delay = parseInt(propValue, 10);
                        renderSubtitles();
                        onPropChanged('extraSubtitlesDelay');
                    }

                    return true;
                }
                case 'extraSubtitlesSize': {
                    if (propValue !== null && isFinite(propValue)) {
                        size = Math.max(0, parseInt(propValue, 10));
                        renderSubtitles();
                        onPropChanged('extraSubtitlesSize');
                    }

                    return true;
                }
                case 'extraSubtitlesOffset': {
                    if (propValue !== null && isFinite(propValue)) {
                        offset = Math.max(0, Math.min(100, parseInt(propValue, 10)));
                        renderSubtitles();
                        onPropChanged('extraSubtitlesOffset');
                    }

                    return true;
                }
                case 'extraSubtitlesTextColor': {
                    if (typeof propValue === 'string') {
                        textColor = propValue;
                        renderSubtitles();
                        onPropChanged('extraSubtitlesTextColor');
                    }

                    return true;
                }
                case 'extraSubtitlesBackgroundColor': {
                    if (typeof propValue === 'string') {
                        backgroundColor = propValue;
                        renderSubtitles();
                        onPropChanged('extraSubtitlesBackgroundColor');
                    }

                    return true;
                }
                case 'extraSubtitlesShadowColor': {
                    if (typeof propValue === 'string') {
                        shadowColor = propValue;
                        renderSubtitles();
                        onPropChanged('extraSubtitlesShadowColor');
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
                case 'addExtraSubtitlesTracks': {
                    if (commandArgs && Array.isArray(commandArgs.tracks)) {
                        tracks = tracks
                            .concat(commandArgs.tracks)
                            .filter(function(track, index, tracks) {
                                return track &&
                                    typeof track.id === 'string' &&
                                    typeof track.url === 'string' &&
                                    typeof track.lang === 'string' &&
                                    typeof track.label === 'string' &&
                                    typeof track.origin === 'string' &&
                                    track.origin !== 'EMBEDDED' &&
                                    index === tracks.findIndex(function(t) { return t.id === track.id; });
                            });
                        onPropChanged('extraSubtitlesTracks');
                    }

                    return true;
                }
                case 'load': {
                    command('unload');
                    if (commandArgs.stream && Array.isArray(commandArgs.stream.subtitles)) {
                        command('addExtraSubtitlesTracks', {
                            tracks: commandArgs.stream.subtitles.map(function(subtitles, index) {
                                return Object.assign({}, subtitles, {
                                    id: 'exclusive_' + index,
                                    label: typeof subtitles.label === 'string' ? subtitles.label : subtitles.lang,
                                    origin: typeof subtitles.origin === 'string' ? subtitles.origin : 'EXCLUSIVE'
                                });
                            })
                        });
                    }

                    return false;
                }
                case 'unload': {
                    cuesByTime = null;
                    tracks = [];
                    selectedTrackId = null;
                    delay = null;
                    renderSubtitles();
                    onPropChanged('extraSubtitlesTracks');
                    onPropChanged('selectedExtraSubtitlesTrackId');
                    onPropChanged('extraSubtitlesDelay');
                    return false;
                }
                case 'destroy': {
                    command('unload');
                    destroyed = true;
                    onPropChanged('extraSubtitlesSize');
                    onPropChanged('extraSubtitlesOffset');
                    onPropChanged('extraSubtitlesTextColor');
                    onPropChanged('extraSubtitlesBackgroundColor');
                    onPropChanged('extraSubtitlesShadowColor');
                    video.dispatch({ type: 'command', commandName: 'destroy' });
                    events.removeAllListeners();
                    events.on('error', function() { });
                    containerElement.removeChild(subtitlesElement);
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

    VideoWithHTMLSubtitles.canPlayStream = function(stream) {
        return Video.canPlayStream(stream);
    };

    VideoWithHTMLSubtitles.manifest = {
        name: Video.manifest.name + 'WithHTMLSubtitles',
        external: Video.manifest.external,
        props: Video.manifest.props.concat(['extraSubtitlesTracks', 'selectedExtraSubtitlesTrackId', 'extraSubtitlesDelay', 'extraSubtitlesSize', 'extraSubtitlesOffset', 'extraSubtitlesTextColor', 'extraSubtitlesBackgroundColor', 'extraSubtitlesShadowColor'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; }),
        commands: Video.manifest.commands.concat(['load', 'unload', 'destroy', 'addExtraSubtitlesTracks'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; }),
        events: Video.manifest.events.concat(['propChanged', 'propValue', 'error', 'extraSubtitlesTrackLoaded'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; })
    };

    return VideoWithHTMLSubtitles;
}

module.exports = withHTMLSubtitles;
