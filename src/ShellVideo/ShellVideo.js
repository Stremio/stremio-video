var EventEmitter = require('eventemitter3');
var cloneDeep = require('lodash.clonedeep');
var deepFreeze = require('deep-freeze');
var ERROR = require('../error');

var SUBS_SCALE_FACTOR = 0.0066;

var stremioToMPVProps = {
    'stream': null,
    'paused': 'pause',
    'time': 'time-pos',
    'duration': 'duration',
    'buffering': 'buffering',
    'volume': 'volume',
    'muted': 'mute',
    'playbackSpeed': 'speed',
    'audioTracks': 'audioTracks',
    'selectedAudioTrackId': 'aid',
    'subtitlesTracks': 'subtitlesTracks',
    'selectedSubtitlesTrackId': 'sid',
    'subtitlesSize': 'sub-scale',
    'subtitlesTextColor': 'sub-color',
    'subtitlesBackgroundColor': 'sub-back-color',
    'subtitlesOutlineColor': 'sub-border-color',
};

function ShellVideo(options) {
    options = options || {};

    var ipc = options.shellTransport;

    var stremioProps = {};
    Object.keys(stremioToMPVProps).forEach(function(key) {
        if(stremioToMPVProps[key]) {
            stremioProps[stremioToMPVProps[key]] = key;
        }
    });

    ipc.send('mpv-command', ['stop']);
    ipc.send('mpv-observe-prop', 'path');

    ipc.send('mpv-observe-prop', 'time-pos');
    ipc.send('mpv-observe-prop', 'volume');
    ipc.send('mpv-observe-prop', 'pause');
    ipc.send('mpv-observe-prop', 'seeking');
    ipc.send('mpv-observe-prop', 'eof-reached');

    ipc.send('mpv-observe-prop', 'duration');
    ipc.send('mpv-observe-prop', 'metadata');
    ipc.send('mpv-observe-prop', 'video-params'); // video width/height
    ipc.send('mpv-observe-prop', 'track-list');

    ipc.send('mpv-observe-prop', 'paused-for-cache');
    ipc.send('mpv-observe-prop', 'cache-buffering-state');

    ipc.send('mpv-observe-prop', 'aid');
    ipc.send('mpv-observe-prop', 'vid');
    ipc.send('mpv-observe-prop', 'sid');
    ipc.send('mpv-observe-prop', 'sub-scale');
    ipc.send('mpv-observe-prop', 'sub-pos');
    ipc.send('mpv-observe-prop', 'speed');

    ipc.send('mpv-observe-prop', 'mpv-version');
    ipc.send('mpv-observe-prop', 'ffmpeg-version');

    var events = new EventEmitter();
    var destroyed = false;
    var stream = null;
    // var selectedSubtitlesTrackId = null;
    var observedProps = {};
    var continueFrom = 0;

    var avgDuration = 0;
    var minClipDuration = 30;
    var props = { };

    function setBackground(visible) {
        // This is a bit of a hack but there is no better way so far
        var bg = visible ? '' : 'transparent';
        for(var container = options.containerElement; container; container = container.parentElement) {
            container.style.background = bg;
        }
    }
    function logProp(args) {
        // eslint-disable-next-line no-console
        console.log(args.name+': '+args.data);
    }
    function embeddedProp(args) {
        return args.data ? 'EMBEDDED_' + args.data.toString() : null;
    }

    var last_time = 0;
    ipc.on('mpv-prop-change', function(args) {
        switch (args.name) {
            case 'mpv-version':
            case 'ffmpeg-version': {
                props[args.name] = logProp(args);
                break;
            }
            case 'duration': {
                var intDuration = args.data | 0;
                // Accumulate average duration over time. if it is greater than minClipDuration
                // and equal to the currently reported duration, it is returned as video length.
                // If the reported duration changes over time the average duration is always
                // smaller than the currently reported one so we set the video length to 0 as
                // this is a live stream.
                props[args.name] = args.data >= minClipDuration && (!avgDuration || intDuration === avgDuration) ? Math.round(args.data * 1000) : null;
                // The average duration is calculated using right bit shifting by one of the sum of
                // the previous average and the currently reported value. This method is not very precise
                // as we get integer value but we avoid floating point errors. JS uses 32 bit values
                // for bitwise maths so the maximum supported video duration is 1073741823 (2 ^ 30 - 1)
                // which is around 34 years of playback time.
                avgDuration = avgDuration ? (avgDuration + intDuration) >> 1 : intDuration;
                break;
            }
            case 'time-pos': {
                props[args.name] = Math.round(args.data*1000);
                if(continueFrom) {
                    ipc.send('mpv-set-prop', ['time-pos', continueFrom]);
                    props[args.name] = Math.round(continueFrom);
                    continueFrom = 0;
                }
                break;
            }
            case 'sub-scale': {
                props[args.name] = Math.round(args.data / SUBS_SCALE_FACTOR);
                break;
            }
            case 'paused-for-cache':
            case 'seeking':
            {
                if(props.buffering !== args.data) {
                    props.buffering = args.data;
                    onPropChanged('buffering');
                }
                break;
            }
            case 'aid':
            case 'sid':
            case 'vid': {
                props[args.name] = embeddedProp(args);
                break;
            }
            // In that case onPropChanged() is manually invoked as track-list contains all
            // the tracks but we have different event for each track type
            case 'track-list': {
                props.audioTracks = args.data.filter(function(x) { return x.type === 'audio'; })
                    .map(function(x, index) {
                        return {
                            id: 'EMBEDDED_' + x.id,
                            lang: x.lang === undefined ? 'Track' + (index + 1) : x.lang,
                            label: x.title === undefined || x.lang === undefined ? '' : x.title || x.lang,
                            origin: 'EMBEDDED',
                            embedded: true,
                            mode: x.id === props.aid ? 'showing' : 'disabled',
                        };
                    });
                onPropChanged('audioTracks');

                props.subtitlesTracks = args.data
                    .filter(function(x) { return x.type === 'sub'; })
                    .map(function(x, index) {
                        return {
                            id: 'EMBEDDED_' + x.id,
                            lang: x.lang === undefined ? 'Track ' + (index + 1) : x.lang,
                            label: x.title === undefined || x.lang === undefined ? '' : x.title || x.lang,
                            origin: 'EMBEDDED',
                            embedded: true,
                            mode: x.id === props.sid ? 'showing' : 'disabled',
                        };
                    });
                onPropChanged('subtitlesTracks');
                break;
            }
            default: {
                props[args.name] = args.data;
                break;
            }
        }

        // Cap time update to update only when a second passes
        var current_time = args.name === 'time-pos' ? Math.floor(props['time-pos'] / 1000) : null;
        if((!current_time || last_time !== current_time)&& stremioProps[args.name]) {
            if(current_time) {
                last_time = current_time;
            }
            onPropChanged(stremioProps[args.name]);
        }
    });
    ipc.on('mpv-event-ended', function(args) {
        if (args.error) onError(args.error);
        else onEnded();
    });

    function getProp(propName) {
        if(stremioToMPVProps[propName]) return props[stremioToMPVProps[propName]];
        // eslint-disable-next-line no-console
        console.log('Unsupported prop requested', propName);
        return null;
    }
    function onError(error) {
        events.emit('error', error);
        if (error.critical) {
            command('unload');
        }
    }
    function onEnded() {
        events.emit('ended');
    }
    function onPropChanged(propName) {
        if (observedProps[propName]) {
            events.emit('propChanged', propName, getProp(propName));
        }
    }
    function observeProp(propName) {
        events.emit('propValue', propName, getProp(propName));
        observedProps[propName] = true;
    }
    function setProp(propName, propValue) {
        switch (propName) {
            case 'paused': {
                if (stream !== null) {
                    ipc.send('mpv-set-prop', ['pause', propValue]);
                }

                break;
            }
            case 'time': {
                if (stream !== null && propValue !== null && isFinite(propValue)) {
                    ipc.send('mpv-set-prop', ['time-pos', propValue/1000]);
                }

                break;
            }
            case 'playbackSpeed': {
                if (stream !== null && propValue !== null && isFinite(propValue)) {
                    ipc.send('mpv-set-prop', ['speed', propValue]);
                }
                break;
            }
            case 'volume': {
                if (stream !== null && propValue !== null && isFinite(propValue)) {
                    props.mute = false;
                    ipc.send('mpv-set-prop', ['mute', 'no']);
                    ipc.send('mpv-set-prop', ['volume', propValue]);
                    onPropChanged('muted');
                    onPropChanged('volume');
                }
                break;
            }
            case 'muted': {
                if (stream !== null) {
                    ipc.send('mpv-set-prop', ['mute', propValue ? 'yes' : 'no']);
                    props.mute = propValue;
                    onPropChanged('muted');
                }
                break;
            }
            case 'selectedAudioTrackId': {
                if (stream !== null) {
                    var actualId = propValue.slice('EMBEDDED_'.length);
                    ipc.send('mpv-set-prop', ['aid', actualId]);
                }
                break;
            }
            case 'selectedSubtitlesTrackId': {
                if (stream !== null) {
                    if(propValue) {
                        var actualId = propValue.slice('EMBEDDED_'.length);
                        ipc.send('mpv-set-prop', ['sid', actualId]);
                        events.emit('subtitlesTrackLoaded', propValue);
                    } else {
                        // turn off subs
                        ipc.send('mpv-set-prop', ['sid', 'no']);
                        props.sid = null;
                    }
                }
                onPropChanged('selectedSubtitlesTrackId');
                break;
            }
            case 'subtitlesSize': {
                ipc.send('mpv-set-prop', [stremioToMPVProps[propName], propValue * SUBS_SCALE_FACTOR]);
                break;
            }
            case 'subtitlesOffset': {
                ipc.send('mpv-set-prop', [stremioToMPVProps[propName], propValue]);
                break;
            }
            case 'subtitlesTextColor':
            case 'subtitlesBackgroundColor':
            case 'subtitlesOutlineColor':
            {
                // MPV accepts color in #AARRGGBB
                var argb = propValue.replace(/^#(\w{6})(\w{2})$/, '#$2$1');
                ipc.send('mpv-set-prop', [stremioToMPVProps[propName], argb]);
                break;
            }
            default: {
                // eslint-disable-next-line no-console
                console.log('Unhandled setProp for', propName);
            }
        }
    }
    function command(commandName, commandArgs) {
        switch (commandName) {
            case 'load': {
                command('unload');
                if (commandArgs && commandArgs.stream && typeof commandArgs.stream.url === 'string') {
                    stream = commandArgs.stream;
                    onPropChanged('stream');
                    continueFrom = commandArgs.time !== null && isFinite(commandArgs.time) ? parseInt(commandArgs.time, 10) / 1000 : 0;

                    setBackground(false);

                    ipc.send('mpv-set-prop', ['no-sub-ass']);

                    // opengl-cb is an alias for the new name "libmpv", as shown in mpv's video/out/vo.c aliases
                    // opengl is an alias for the new name "gpu"
                    // When on Windows we use d3d for the rendering in separate window
                    var windowRenderer = navigator.platform === 'Win32' ? 'direct3d' : 'opengl';
                    var videoOutput = options.mpvSeparateWindow ? windowRenderer : 'opengl-cb';
                    var separateWindow = options.mpvSeparateWindow ? 'yes' : 'no';
                    ipc.send('mpv-set-prop', ['vo', videoOutput]);
                    ipc.send('mpv-set-prop', ['osc', separateWindow]);
                    ipc.send('mpv-set-prop', ['input-defalt-bindings', separateWindow]);
                    ipc.send('mpv-set-prop', ['input-vo-keyboard', separateWindow]);

                    ipc.send('mpv-command', ['loadfile', stream.url]);
                    ipc.send('mpv-set-prop', ['pause', false]);
                    ipc.send('mpv-set-prop', ['speed', props.speed]);
                    ipc.send('mpv-set-prop', ['aid', props.aid]);
                    ipc.send('mpv-set-prop', ['mute', 'no']);

                    onPropChanged('paused');
                    onPropChanged('time');
                    onPropChanged('duration');
                    onPropChanged('buffering');
                    onPropChanged('volume');
                    onPropChanged('muted');
                    onPropChanged('subtitlesTracks');
                    onPropChanged('selectedSubtitlesTrackId');
                } else {
                    onError(Object.assign({}, ERROR.UNSUPPORTED_STREAM, {
                        critical: true,
                        stream: commandArgs ? commandArgs.stream : null
                    }));
                }

                break;
            }
            case 'unload': {
                props = {
                    mute: false,
                    speed: 1,
                    subtitlesTracks: [],
                    buffering: true,
                    aid: null,
                    sid: null,
                };
                continueFrom = 0;
                avgDuration = 0;
                ipc.send('mpv-command', ['stop']);
                onPropChanged('stream');
                onPropChanged('paused');
                onPropChanged('time');
                onPropChanged('duration');
                onPropChanged('buffering');
                onPropChanged('volume');
                onPropChanged('muted');
                onPropChanged('subtitlesTracks');
                onPropChanged('selectedSubtitlesTrackId');
                setBackground(true);
                break;
            }
            case 'destroy': {
                command('unload');
                destroyed = true;
                events.removeAllListeners();
                break;
            }
        }
    }

    this.on = function (eventName, listener) {
        if (destroyed) {
            throw new Error('Video is destroyed');
        }

        events.on(eventName, listener);
    };
    this.dispatch = function (action) {
        if (destroyed) {
            throw new Error('Video is destroyed');
        }

        if (action) {
            action = deepFreeze(cloneDeep(action));
            switch (action.type) {
                case 'observeProp': {
                    observeProp(action.propName);
                    break;
                }
                case 'setProp': {
                    setProp(action.propName, action.propValue);
                    return;
                }
                case 'command': {
                    command(
                        action.commandName,
                        action.commandArgs
                    );
                    return;
                }
            }
        }
    };
}
ShellVideo.canPlayStream = function() {
    return Promise.resolve(true);
};

ShellVideo.manifest = {
    name: 'ShellVideo',
    external: false,
    props: Object.keys(stremioToMPVProps),
    commands: ['load', 'unload', 'destroy'],
    events: [
        'propValue',
        'propChanged',
        'ended',
        'error',
        'subtitlesTrackLoaded',
    ],
};

module.exports = ShellVideo;
