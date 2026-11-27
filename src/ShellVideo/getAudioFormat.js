// Audio format of an mpv track-list entry, or null when mpv reports no codec.
// mpv / FFmpeg quirks are normalized here, so consumers get one shape:
// - codec: lowercase FFmpeg codec id, all PCM variants ("pcm_s16le", "pcm_bluray", ...) as "pcm"
// - profile: FFmpeg profile name ("Dolby Digital Plus + Dolby Atmos", "DTS-HD MA"), null when empty or "unknown"
// - channels: layout as "X.Y" ("5.1(side)" -> "5.1", "stereo" -> "2.0", "mono" -> "1.0"), null for
//   other layout names, including the "unknownN" that mpv's own Matroska demuxer reports
// - channelCount: number of channels, null when unknown
function getAudioFormat(track) {
    if (typeof track.codec !== 'string' || track.codec.length === 0) {
        return null;
    }

    var codec = track.codec.toLowerCase();
    var profile = track['codec-profile'];
    var channelCount = track['demux-channel-count'];
    return {
        codec: codec.indexOf('pcm_') === 0 ? 'pcm' : codec,
        profile: typeof profile === 'string' && profile.length > 0 && profile.toLowerCase() !== 'unknown' ? profile : null,
        channels: getChannelLayout(track['demux-channels']),
        channelCount: typeof channelCount === 'number' && channelCount > 0 ? channelCount : null,
    };
}

function getChannelLayout(channels) {
    if (typeof channels !== 'string') {
        return null;
    }

    // Drop the speaker position variant: "5.1(side)", "7.1(wide)"
    var layout = channels.toLowerCase().replace(/\(.*\)$/, '');
    if (layout === 'mono') {
        return '1.0';
    }

    if (layout === 'stereo') {
        return '2.0';
    }

    return /^\d+\.\d+(\.\d+)?$/.test(layout) ? layout : null;
}

module.exports = getAudioFormat;
