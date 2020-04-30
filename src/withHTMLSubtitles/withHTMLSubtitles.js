var EventEmitter = require('events');
var subtitlesRenderer = require('./subtitlesRenderer');
var fetchSubtitles = require('./fetchSubtitles');

function withHTMLSubtitles(Video) {
    function VideoWithHTMLSubtitles(options) {
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

        var time = null;
        video.on('propChanged', function(propName, propValue) {
            if (propName === 'time') {
                time = propValue;
                renderSubtitles();
            }
        });

        var destroyed = false;
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
                        return [];
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
        function onPropChanged(propName) {
            if (observedProps[propName]) {
                events.emit('propChanged', propName, getProp(propName));
            }
        }
        function observeProp(propName) {
            if (!observedProps.hasOwnProperty(propName)) {
                return false;
            }

            events.emit('propValue', propName, getProp(propName));
            observedProps[propName] = true;
            return true;
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
                                }
                            })
                            .catch(function(error) {
                                if (selecterdTrack.id === selectedTrackId) {
                                    onError(error);
                                }
                            });
                    }

                    renderSubtitles();
                    onPropChanged('selectedSubtitlesTrackId');
                    onPropChanged('subtitlesDelay');
                    return true;
                }
                case 'subtitlesDelay': {
                    if (selectedTrackId !== null && propValue !== null && isFinite(propValue)) {
                        delay = parseInt(propValue);
                        renderSubtitles();
                        onPropChanged('subtitlesDelay');
                    }

                    return true;
                }
                case 'subtitlesSize': {
                    if (propValue !== null && isFinite(propValue)) {
                        size = parseInt(propValue);
                        renderSubtitles();
                        onPropChanged('subtitlesSize');
                    }

                    return true;
                }
                case 'subtitlesOffset': {
                    if (propValue !== null && isFinite(propValue)) {
                        offset = Math.max(0, Math.min(100, parseInt(propValue)));
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
                        tracks = commandArgs.tracks
                            .filter(function(track) {
                                return track &&
                                    typeof track.url === 'string' &&
                                    track.url.length > 0 &&
                                    typeof track.origin === 'string' &&
                                    track.origin.length > 0 &&
                                    track.origin !== 'VIDEO_EMBEDDED';
                            })
                            .map(function(track) {
                                return Object.freeze(Object.assign({}, track, {
                                    id: track.url
                                }));
                            })
                            .concat(tracks)
                            .filter(function(track, index, tracks) {
                                for (var i = 0; i < tracks.length; i++) {
                                    if (tracks[i].id === track.id) {
                                        return i === index;
                                    }
                                }

                                return false;
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
                    onPropChanged('tracks');
                    onPropChanged('selectedSubtitlesTrackId');
                    onPropChanged('delay');
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
            if (!destroyed) {
                events.on(eventName, listener);
            }

            video.on(eventName, listener);
        };
        this.dispatch = function(action) {
            if (!destroyed && action) {
                switch (action.type) {
                    case 'observeProp': {
                        var handled = observeProp(action.propName);
                        if (handled) {
                            return;
                        }

                        break;
                    }
                    case 'setProp': {
                        var handled = setProp(action.propName, action.propValue);
                        if (handled) {
                            return;
                        }

                        break;
                    }
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

    VideoWithHTMLSubtitles.manifest = {
        name: Video.manifest.name + 'WithHTMLSubtitles',
        embedded: Video.manifest.embedded,
        props: Video.manifest.props.concat(['subtitlesTracks', 'selectedSubtitlesTrackId', 'subtitlesDelay', 'subtitlesSize', 'subtitlesOffset', 'subtitlesTextColor', 'subtitlesBackgroundColor', 'subtitlesShadowColor'])
            .filter(function(propName, index, props) {
                return props.indexOf(propName) === index;
            })
    };

    return VideoWithHTMLSubtitles;
}

module.exports = withHTMLSubtitles;
