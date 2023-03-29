var url = require('url');

function fetchFilename(streamingServerURL, infoHash) {
    return fetch(url.resolve(streamingServerURL, '/'+infoHash+'/stats.json'))
        .then(function(resp) {
            if (resp.ok) {
                return resp.json();
            }

            throw new Error(resp.status + ' (' + resp.statusText + ')');
        })
        .then(function(resp) {
            if (!resp.streamName) {
                throw new Error('Could not retrieve filename from torrent');
            }

            return resp.streamName;
        });
}

module.exports = fetchFilename;
