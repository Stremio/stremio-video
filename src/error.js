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
    UNKNOWN_ERROR: {
        code: 1,
        message: 'Unknown error'
    }
};

module.exports = ERROR;
