var MP4_CONFIG = {
    VIDEO_CODECS: [
        {
            codec: "h264",
            force: window.chrome || window.cast,
            mime: 'video/mp4; codecs="avc1.42E01E"',
        },
        {
            codec: "h265",
            force: window.chrome || window.cast,
            mime: 'video/mp4; codecs="hev1.1.6.L150.B0"',
            aliases: ["hevc"],
        },
        {
            codec: "vp8",
            mime: 'video/mp4; codecs="vp8"',
        },
        {
            codec: "vp9",
            mime: 'video/mp4; codecs="vp9"',
        },
    ],
    AUDIO_CODEC: [
        {
            codec: "aac",
            force: window.chrome || window.cast,
            mime: 'audio/mp4; codecs="mp4a.40.2"',
        },
        {
            codec: "mp3",
            force: window.chrome || window.cast,
            mime: 'audio/mp4; codecs="mp3"',
        },
        {
            codec: "ac3",
            mime: 'audio/mp4; codecs="ac-3"',
        },
        {
            codec: "eac3",
            mime: 'audio/mp4; codecs="ec-3"',
        },
        {
            codec: "vorbis",
            mime: 'audio/mp4; codecs="vorbis"',
        },
        {
            codec: "opus",
            mime: 'audio/mp4; codecs="opus"',
        },
    ],
};

var MATROSKA_CONFIG = {
    VIDEO_CODECS: [
        {
            codec: "h264",
            force: window.chrome || window.cast,
        },
        {
            codec: "h265",
            force: window.chrome || window.cast,
            aliases: ["hevc"],
        },
        {
            codec: "vp8",
            mime: 'video/webm; codecs="vp8"',
        },
        {
            codec: "vp9",
            mime: 'video/webm; codecs="vp9"',
        },
    ],
    AUDIO_CODEC: [
        {
            codec: "aac",
            force: window.chrome || window.cast,
        },
        {
            codec: "mp3",
            force: window.chrome || window.cast,
        },
        {
            codec: "vorbis",
            mime: 'audio/webm; codecs="vorbis"',
        },
        {
            codec: "opus",
            mime: 'audio/webm; codecs="opus"',
        },
    ],
};

function canPlay(config, options) {
    return config.force || options.mediaElement.canPlayType(config.mime)
        ? [config.codec].concat(config.aliases || [])
        : [];
}

function getMaxAudioChannels() {
    if (/firefox/i.test(window.navigator.userAgent)) {
        return 6;
    }

    if (!window.AudioContext || window.chrome) {
        return 2;
    }

    var maxChannelCount = new AudioContext().destination.maxChannelCount;
    return maxChannelCount > 0 ? maxChannelCount : 2;
}

function getMediaCapabilities() {
    var mediaElement = document.createElement("video");
    var maxAudioChannels = getMaxAudioChannels();
    return {
        mp4: {
            videoCodecs: MP4_CONFIG.VIDEO_CODECS.map(function (config) {
                return canPlay(config, { mediaElement: mediaElement });
            }).reduce(function (result, value) {
                return result.concat(value);
            }, []),
            audioCodecs: MP4_CONFIG.AUDIO_CODEC.map(function (config) {
                return canPlay(config, { mediaElement: mediaElement });
            }).reduce(function (result, value) {
                return result.concat(value);
            }, []),
            maxAudioChannels,
        },
        'matroska,webm': {
            videoCodecs: MATROSKA_CONFIG.VIDEO_CODECS.map(function (config) {
                return canPlay(config, { mediaElement: mediaElement });
            }).reduce(function (result, value) {
                return result.concat(value);
            }, []),
            audioCodecs: MATROSKA_CONFIG.AUDIO_CODEC.map(function (config) {
                return canPlay(config, { mediaElement: mediaElement });
            }).reduce(function (result, value) {
                return result.concat(value);
            }, []),
            maxAudioChannels,
        },
    };
}

module.exports = getMediaCapabilities();
