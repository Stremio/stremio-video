// AVPlay removes unsupported streams and renumbers the remaining tracks.
// Match metadata in media order within each type, never by the original ID.
var AUDIO_CODECS = {
    aac: 'aac', aacl: 'aac', 'a-ac3': 'ac3', ac3: 'ac3', 'ac-3': 'ac3',
    'audio/x-ac3': 'ac3', eac3: 'eac3', 'ec-3': 'eac3', 'audio/x-eac3': 'eac3',
    dts: 'dts', truehd: 'truehd', mp3: 'mp3', mp2: 'mp2',
    opus: 'opus', vorbis: 'vorbis', flac: 'flac'
};
var BITMAP_SUBTITLES = ['hdmv/pgs', 'hdmv_pgs_subtitle', 'pgs', 'dvd_subtitle', 'dvb_subtitle', 'vobsub', 'xsub'];

function extraInfo(track) {
    try {
        return JSON.parse(track.extra_info) || {};
    } catch (_e) {
        return {};
    }
}
function codecs(codec) {
    if (typeof codec !== 'string') return [];
    var key = codec.toLowerCase();
    // Some Samsung versions report both AAC and MPEG audio as "mpeg".
    if (key === 'mpeg') return ['aac', 'mp3', 'mp2'];
    return AUDIO_CODECS[key] ? [AUDIO_CODECS[key]] : [];
}
function mapTracksData(nativeTracks, sourceTracks, type) {
    var native = nativeTracks.filter(function(track) { return track.type === type; })
        .sort(function(a, b) { return a.index - b.index; });
    var source = (Array.isArray(sourceTracks) ? sourceTracks : []).slice()
        .sort(function(a, b) { return a.id - b.id; });
    var result = {};
    if (!native.length || !source.length) return result;

    if (source.length !== native.length) {
        if (type === 'AUDIO') {
            var supported = native.map(function(track) { return codecs(extraInfo(track).fourCC); });
            // Without codec information, reassigning labels could pick a different language.
            if (supported.some(function(list) { return !list.length; })) return result;
            source = source.filter(function(track) {
                var candidates = codecs(track.codec);
                return candidates.some(function(codec) {
                    return supported.some(function(list) { return list.includes(codec); });
                });
            });
        } else if (type === 'TEXT') {
            if (native.some(function(track) {
                var codec = extraInfo(track).fourCC;
                return typeof codec === 'string' && BITMAP_SUBTITLES.includes(codec.toLowerCase());
            })) return result;
            source = source.filter(function(track) {
                return typeof track.codec === 'string' && !BITMAP_SUBTITLES.includes(track.codec.toLowerCase());
            });
        }
    }
    // A partial/ambiguous list is not enough evidence to relabel native tracks.
    if (source.length !== native.length) return result;
    if (type === 'AUDIO' && native.some(function(track, index) {
        var nativeCodecs = codecs(extraInfo(track).fourCC);
        var sourceCodecs = codecs(source[index].codec);
        return nativeCodecs.length && sourceCodecs.length && !sourceCodecs.some(function(codec) { return nativeCodecs.includes(codec); });
    })) return result;
    native.forEach(function(track, index) { result[track.index] = source[index]; });
    return result;
}

module.exports = mapTracksData;
