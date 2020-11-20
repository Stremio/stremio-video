var ERROR = {
    CAST_VIDEO: {
        INVALID_MESSAGE_RECEIVED: {
            code: 100,
            message: 'Invalid message received'
        },
        MESSAGE_SEND_FAILED: {
            code: 101,
            message: 'Failed to send message'
        }
    },
    YOUTUBE_VIDEO: {
        API_LOAD_FAILED: {
            code: 90,
            message: 'YouTube player iframe API failed to load',
        },
        INVALID_PARAMETER: {
            code: 91,
            message: 'The request contains an invalid parameter value'
        },
        HTML5_VIDEO: {
            code: 92,
            message: 'The requested content cannot be played in an HTML5 player'
        },
        VIDEO_NOT_FOUND: {
            code: 93,
            message: 'The video requested was not found'
        },
        VIDEO_NOT_EMBEDDABLE: {
            code: 94,
            message: 'The owner of the requested video does not allow it to be played in embedded players'
        }
    },
    HTML_VIDEO: {
        MEDIA_ERR_ABORTED: {
            code: 80,
            message: 'Fetching process aborted'
        },
        MEDIA_ERR_NETWORK: {
            code: 81,
            message: 'Error occurred when downloading'
        },
        MEDIA_ERR_DECODE: {
            code: 82,
            message: 'Error occurred when decoding'
        },
        MEDIA_ERR_SRC_NOT_SUPPORTED: {
            code: 83,
            message: 'Video is not supported'
        }
    },
    WITH_HTML_SUBTITLES: {
        FETCH_FAILED: {
            code: 70,
            message: 'Failed to fetch subtitles'
        },
        PARSE_FAILED: {
            code: 71,
            message: 'Failed to parse subtitles'
        }
    },
    WITH_STREAMING_SERVER: {
        TORRENT_FETCH_FAILED: {
            code: 60,
            message: 'Failed to fetch files from torrent'
        },
        STREAM_CONVERT_FAILED: {
            code: 61,
            message: 'Unable to convert stream',
        },
        TRANSCODING_FAILED: {
            code: 62,
            message: 'Unable to transcode the next segment of the stream',
        }
    },
    UNKNOWN_ERROR: {
        code: 1,
        message: 'Unknown error'
    },
    UNSUPPORTED_STREAM: {
        code: 2,
        message: 'Stream is not supported'
    }
};

module.exports = ERROR;
