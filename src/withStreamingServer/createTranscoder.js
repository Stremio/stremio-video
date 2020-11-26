var url = require('url');
var ERROR = require('../error');

function createTranscoder(streamingServerURL, videoURL, time) {
    return fetch(url.resolve(streamingServerURL, '/transcode/create') + '?' + new URLSearchParams([['url', videoURL], ['time', time]]).toString())
        .then(function(resp) {
            return resp.json();
        })
        .then(function(resp) {
            if (resp.error) {
                throw resp.error;
            }

            if (typeof resp.hash !== 'string' || (resp.duration !== null && !isFinite(resp.duration)) || typeof resp.ended !== 'boolean') {
                throw new Error('Inavalid response: ' + JSON.stringify(resp));
            }

            return Object.assign({}, resp, {
                streamingServerURL: streamingServerURL,
                time: time,
                url: url.resolve(streamingServerURL, '/transcode/' + encodeURIComponent(resp.hash) + '/playlist.m3u8')
            });
        })
        .catch(function(error) {
            throw Object.assign({}, ERROR.WITH_STREAMING_SERVER.TRANSCODER_CREATE_FAILED, {
                error: error
            });
        });
}

module.exports = createTranscoder;
