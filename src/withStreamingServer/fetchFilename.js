var url = require('url');

function fetchFilename(streamingServerURL, mediaUrl, infoHash, fileIdx) {
    if (infoHash) {
        return fetch(url.resolve(streamingServerURL, '/' + encodeURIComponent(infoHash) + '/' + encodeURIComponent(fileIdx) + '/stats.json'))
            .then(function(resp) {
                if (resp.ok) {
                    return resp.json();
                }

                throw new Error(resp.status + ' (' + resp.statusText + ')');
            })
            .then(function(resp) {
                if (typeof resp.streamName !== 'string') {
                    throw new Error('Could not retrieve filename from torrent');
                }

                return resp.streamName;
            });
    }

    return Promise.resolve(decodeURIComponent(mediaUrl.split('/').pop()));
}

module.exports = fetchFilename;
