var ERROR = {
    YOUTUBE_VIDEO: {
        API_LOAD_FAILED: {
            code: 90,
            message: 'YouTube player iframe API failed to load',
        },
        INVALID_VIDEO_REQUEST: {
            code: 91,
            message: 'The video request is invalid'
        },
        VIDEO_CANNOT_BE_PLAYED: {
            code: 92,
            message: 'The video cannot be played'
        },
        VIDEO_REMOVED: {
            code: 93,
            message: 'The video has been removed or marked as private'
        },
        VIDEO_CANNOT_BE_EMBEDDED: {
            code: 94,
            message: 'The video cannot be played in embedded players'
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
    UNKNOWN_ERROR: {
        code: 1,
        message: 'Unknown error'
    }
};

module.exports = ERROR;
