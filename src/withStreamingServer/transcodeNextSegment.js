var url = require('url');

function transcodeNextSegment(streamingServerURL, hash) {
    return fetch(url.resolve(streamingServerURL, '/transcode/next') + '?' + new URLSearchParams([['hash', hash]]).toString())
        .then(function(resp) {
            return resp.json();
        })
        .then(function(resp) {
            if (!resp.error && typeof resp.ended !== 'boolean') {
                throw new Error('Inavalid response: ' + JSON.stringify(resp));
            }

            return resp;
        });
}

module.exports = transcodeNextSegment;
