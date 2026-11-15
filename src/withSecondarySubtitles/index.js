var EventEmitter = require('eventemitter3');
var ERROR = require('../error');

var PROPS = ['secondarySubtitlesTrack', 'secondarySubtitlesLoading', 'secondarySubtitlesOffset', 'secondarySubtitlesDelay'];
var TEXT_CODECS = ['subrip', 'srt', 'webvtt', 'ass', 'ssa', 'text', 'mov_text'];

module.exports = function withSecondarySubtitles(Video) {
    function SecondaryVideo(options) {
        var video = new Video(options);
        var ipc = options.shellTransport;
        var events = new EventEmitter();
        var observed = {};
        var prefix = '__stremio_secondary_' + Math.random().toString(36).slice(2) + '_';
        var generation = 0;
        var pending = null;
        var nativeId = null;
        var nativeTracks = [];
        var selected = null;
        var loading = false;
        var offset = 95;
        var delay = 0;
        var loaded = false;

        function value(name) {
            switch (name) {
                case 'secondarySubtitlesTrack': return selected;
                case 'secondarySubtitlesLoading': return loading;
                case 'secondarySubtitlesOffset': return offset;
                case 'secondarySubtitlesDelay': return delay;
            }
        }
        function changed(name) {
            if (observed[name]) events.emit('propChanged', name, value(name));
        }
        function setNative(name, val) {
            // The Linux shell's typed property bridge does not expose secondary properties.
            ipc.send('mpv-command', ['set', name, String(val)]);
        }
        function owned(track) {
            return track.nativeExternal === true && typeof track.nativeExternalTitle === 'string' && track.nativeExternalTitle.startsWith(prefix);
        }
        function remove(track) {
            ipc.send('mpv-command', ['sub-remove', track.id.slice('EMBEDDED_'.length)]);
        }
        function clear() {
            generation++;
            if (pending) clearTimeout(pending.timeout);
            pending = null;
            if (selected || nativeId || loading) setNative('secondary-sid', 'no');
            var oldId = nativeId;
            nativeId = null;
            selected = null;
            loading = false;
            nativeTracks.filter(function(track) { return owned(track) && track.id === oldId; }).forEach(remove);
            changed('secondarySubtitlesTrack');
            changed('secondarySubtitlesLoading');
        }
        function activate(id) {
            nativeId = id;
            setNative('secondary-sub-pos', 100 - offset);
            setNative('secondary-sub-delay', delay / 1000);
            setNative('secondary-sid', id.slice('EMBEDDED_'.length));
            loading = false;
            changed('secondarySubtitlesLoading');
        }
        function loadExternal(track, url, fallback) {
            var request = ++generation;
            var title = prefix + request;
            pending = { title: title, timeout: setTimeout(function() {
                if (!pending || pending.title !== title) return;
                pending = null;
                if (!fallback && typeof track.fallbackUrl === 'string' && track.fallbackUrl !== url) {
                    loadExternal(track, track.fallbackUrl, true);
                    return;
                }
                clear();
                events.emit('error', Object.assign({}, ERROR.WITH_HTML_SUBTITLES.LOAD_FAILED, {
                    critical: false,
                    track: track,
                    error: new Error('Secondary subtitle could not be loaded'),
                }));
            }, 15000) };
            // "auto" loads the track without changing the primary selection.
            ipc.send('mpv-command', ['sub-add', url, 'auto', title, track.lang || '']);
        }
        function select(track) {
            if (track && selected && track.id === selected.id && !!track.embedded === !!selected.embedded) return;
            clear();
            delay = 0;
            changed('secondarySubtitlesDelay');
            if (!track || !loaded) return;
            if (track.embedded) {
                var nativeTrack = nativeTracks.find(function(item) { return item.id === track.id && item.secondarySupported; });
                if (!nativeTrack) return;
                selected = track;
                activate(track.id);
            } else {
                if (track.local || typeof track.url !== 'string' || !/^https?:\/\//i.test(track.url)) return;
                selected = track;
                loading = true;
                loadExternal(track, track.url, false);
            }
            changed('secondarySubtitlesTrack');
            changed('secondarySubtitlesLoading');
        }
        function onProperty(event, name, val) {
            if (name === 'subtitlesTracks' && Array.isArray(val)) {
                nativeTracks = val.map(function(track) {
                    return Object.assign({}, track, { secondarySupported: TEXT_CODECS.includes(track.codec) });
                });
                nativeTracks.filter(owned).forEach(function(track) {
                    if (pending && track.nativeExternalTitle === pending.title) {
                        clearTimeout(pending.timeout);
                        pending = null;
                        activate(track.id);
                    } else if (track.id !== nativeId) {
                        remove(track);
                    }
                });
                val = nativeTracks.filter(function(track) { return !owned(track); });
            }
            events.emit(event, name, val);
        }
        video.on('propValue', onProperty.bind(null, 'propValue'));
        video.on('propChanged', onProperty.bind(null, 'propChanged'));
        Video.manifest.events.filter(function(name) { return name !== 'propValue' && name !== 'propChanged'; }).forEach(function(name) {
            video.on(name, function() { events.emit.apply(events, [name].concat(Array.from(arguments))); });
        });
        this.on = function(name, listener) { events.on(name, listener); };
        this.dispatch = function(action) {
            if (action.type === 'observeProp' && PROPS.includes(action.propName)) {
                observed[action.propName] = true;
                events.emit('propValue', action.propName, value(action.propName));
                return;
            }
            if (action.type === 'setProp' && PROPS.includes(action.propName)) {
                var val = action.propValue;
                switch (action.propName) {
                    case 'secondarySubtitlesTrack': select(val); break;
                    case 'secondarySubtitlesOffset':
                        if (typeof val === 'number' && isFinite(val)) {
                            offset = Math.max(0, Math.min(100, val));
                            if (nativeId) setNative('secondary-sub-pos', 100 - offset);
                            changed(action.propName);
                        }
                        break;
                    case 'secondarySubtitlesDelay':
                        if (typeof val === 'number' && isFinite(val)) {
                            delay = val;
                            if (nativeId) setNative('secondary-sub-delay', delay / 1000);
                            changed(action.propName);
                        }
                        break;
                }
                return;
            }
            if (action.type === 'command' && ['load', 'unload', 'destroy'].includes(action.commandName)) {
                clear();
                nativeTracks = [];
                delay = 0;
                changed('secondarySubtitlesDelay');
                loaded = action.commandName === 'load';
            }
            video.dispatch(action);
            if (action.type === 'command' && action.commandName === 'destroy') events.removeAllListeners();
        };
    }
    SecondaryVideo.canPlayStream = Video.canPlayStream;
    SecondaryVideo.manifest = Object.assign({}, Video.manifest, {
        name: Video.manifest.name + 'WithSecondarySubtitles',
        props: Video.manifest.props.concat(PROPS),
    });
    return SecondaryVideo;
};
