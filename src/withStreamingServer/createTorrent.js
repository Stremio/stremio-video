var url = require('url');
var ERROR = require('../error');

function createTorrent(streamingServerURL, infoHash, sources) {
    return fetch(url.resolve(streamingServerURL, '/' + encodeURIComponent(infoHash) + '/create'), {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            torrent: {
                infoHash: infoHash,
                peerSearch: {
                    sources: ['dht:' + infoHash].concat(Array.isArray(sources) ? sources : []),
                    min: 40,
                    max: 150
                }
            }
        })
    }).then(function(resp) {
        return resp.json();
    }).catch(function(error) {
        throw Object.assign({}, ERROR.WITH_STREAMING_SERVER.TORRENT_FETCH_FAILED, {
            error: error
        });
    }).then(function(resp) {
        if (!resp || !Array.isArray(resp.files) || resp.files.length === 0) {
            throw ERROR.WITH_STREAMING_SERVER.TORRENT_FETCH_FAILED;
        }

        return resp;
    });
}

module.exports = createTorrent;
