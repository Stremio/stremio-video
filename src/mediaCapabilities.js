var VIDEO_CODECS_CONFIG = [
    {
        codec: 'h264',
        mime: 'video/mp4; codecs="avc1.42E01E"',
    },
    {
        codec: 'h265',
        mime: 'video/mp4; codecs="hev1.1.6.L150.B0"',
        aliases: ['hevc']
    },
    {
        codec: 'vp8',
        mime: 'video/mp4; codecs="vp8"'
    },
    {
        codec: 'vp9',
        mime: 'video/mp4; codecs="vp9"'
    }
];

var AUDIO_CODECS_CONFIG = [
    {
        codec: 'aac',
        mime: 'audio/mp4; codecs="mp4a.40.2"'
    },
    {
        codec: 'mp3',
        mime: 'audio/mp4; codecs="mp3"'
    },
    {
        codec: 'ac3',
        mime: 'audio/mp4; codecs="ac-3"'
    },
    {
        codec: 'eac3',
        mime: 'audio/mp4; codecs="ec-3"'
    },
    {
        codec: 'vorbis',
        mime: 'audio/mp4; codecs="vorbis"'
    },
    {
        codec: 'opus',
        mime: 'audio/mp4; codecs="opus"'
    }
];

function canPlay(config, options) {
    return options.mediaElement.canPlayType(config.mime) ?
        [config.codec].concat(config.aliases || [])
        :
        [];
}

function getMaxAudioChannels() {
    if (!window.AudioContext) {
        return 2;
    }

    if (/firefox/i.test(window.navigator.userAgent)) {
        return 6;
    }

    var maxChannelCount = new AudioContext().destination.maxChannelCount;
    return maxChannelCount > 0 ? maxChannelCount : 2;
}

function getMediaCapabilities() {
    var mediaElement = document.createElement('video');
    var videoCodecs = VIDEO_CODECS_CONFIG
        .map(function(config) {
            return canPlay(config, {
                mediaElement: mediaElement
            });
        })
        .reduce(function(result, value) {
            return result.concat(value);
        }, []);
    var audioCodecs = AUDIO_CODECS_CONFIG
        .map(function(config) {
            return canPlay(config, {
                mediaElement: mediaElement
            });
        })
        .reduce(function(result, value) {
            return result.concat(value);
        }, []);
    var maxAudioChannels = getMaxAudioChannels();
    var formats = ['mp4'];
    return {
        formats: formats,
        videoCodecs: videoCodecs,
        audioCodecs: audioCodecs,
        maxAudioChannels: maxAudioChannels
    };
}

module.exports = getMediaCapabilities();
