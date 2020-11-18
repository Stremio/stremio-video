var EventEmitter = require('events');
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

        video.on('propValue', onVideoPropChanged);
        video.on('propChanged', onVideoPropChanged);

        var destroyed = false;
        var time = null;
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
            subtitlesShadowColor: false,
        };

        function renderSubtitles() {
            while (subtitlesElement.hasChildNodes()) {
                subtitlesElement.removeChild(subtitlesElement.lastChild);
            }

            if (cuesByTime === null || time === null || !isFinite(time)) {
                return;
            }

            subtitlesElement.style.bottom = offset + '%';
            subtitlesRenderer.render(cuesByTime, time + delay)
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
        function getProp(propName) {
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
                    if (destroyed || selectedTrackId === null) {
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
            }
        }
        function onError(error) {
            events.emit('error', error);
            if (error.critical) {
                command('unload');
                video.dispatch({ type: 'command', commandName: 'unload' });
            }
        }
        function onVideoPropChanged(propName, propValue) {
            if (propName === 'time') {
                time = propValue;
                renderSubtitles();
            }
        }
        function onPropChanged(propName) {
            if (observedProps[propName]) {
                events.emit('propChanged', propName, getProp(propName));
            }
        }
        function observeProp(propName) {
            if (observedProps.hasOwnProperty(propName)) {
                events.emit('propValue', propName, getProp(propName));
                observedProps[propName] = true;
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
                                if (selecterdTrack.id === selectedTrackId) {
                                    cuesByTime = resp;
                                    renderSubtitles();
                                    events.emit('subtitlesTrackLoaded', selecterdTrack);
                                }
                            })
                            .catch(function(error) {
                                if (selecterdTrack.id === selectedTrackId) {
                                    onError(Object.assign({}, error, {
                                        critical: false
                                    }));
                                }
                            });
                    }

                    renderSubtitles();
                    onPropChanged('selectedSubtitlesTrackId');
                    onPropChanged('subtitlesDelay');
                    break;
                }
                case 'subtitlesDelay': {
                    if (selectedTrackId !== null && propValue !== null && isFinite(propValue)) {
                        delay = parseInt(propValue);
                        renderSubtitles();
                        onPropChanged('subtitlesDelay');
                    }

                    break;
                }
                case 'subtitlesSize': {
                    if (propValue !== null && isFinite(propValue)) {
                        size = parseInt(propValue);
                        renderSubtitles();
                        onPropChanged('subtitlesSize');
                    }

                    break;
                }
                case 'subtitlesOffset': {
                    if (propValue !== null && isFinite(propValue)) {
                        offset = Math.max(0, Math.min(100, parseInt(propValue)));
                        renderSubtitles();
                        onPropChanged('subtitlesOffset');
                    }

                    break;
                }
                case 'subtitlesTextColor': {
                    if (typeof propValue === 'string') {
                        textColor = propValue;
                        renderSubtitles();
                        onPropChanged('subtitlesTextColor');
                    }

                    break;
                }
                case 'subtitlesBackgroundColor': {
                    if (typeof propValue === 'string') {
                        backgroundColor = propValue;
                        renderSubtitles();
                        onPropChanged('subtitlesBackgroundColor');
                    }

                    break;
                }
                case 'subtitlesShadowColor': {
                    if (typeof propValue === 'string') {
                        shadowColor = propValue;
                        renderSubtitles();
                        onPropChanged('subtitlesShadowColor');
                    }

                    break;
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
                                    typeof track.origin === 'string' &&
                                    track.origin.length > 0 &&
                                    track.origin !== 'VIDEO_EMBEDDED';
                            })
                            .map(function(track, index) {
                                return Object.freeze(Object.assign({}, track, {
                                    id: 'ext' + index
                                }));
                            });
                        onPropChanged('subtitlesTracks');
                    }

                    break;
                }
                case 'load': {
                    command('unload');
                    break;
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
                    break;
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
                    break;
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
                    case 'observeProp': {
                        observeProp(action.propName);
                        break;
                    }
                    case 'setProp': {
                        setProp(action.propName, action.propValue);
                        break;
                    }
                    case 'command': {
                        command(action.commandName, action.commandArgs);
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
        events: Video.manifest.events.concat(['propChanged', 'propValue', 'error', 'subtitlesTrackLoaded'])
            .filter(function(value, index, array) { return array.indexOf(value) === index; })
    };

    return VideoWithHTMLSubtitles;
}

module.exports = withHTMLSubtitles;
