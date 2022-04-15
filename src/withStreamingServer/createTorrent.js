var url = require('url');

function createTorrent(streamingServerURL, infoHash, sources, guessFileIdx) {
    var body = {
        torrent: {
            infoHash: infoHash,
        }
    };
    if ((sources || []).length) {
        body.torrent.peerSearch = {
            sources: ['dht:' + infoHash].concat(Array.isArray(sources) ? sources : []),
            min: 40,
            max: 150
        };
    }
    if (guessFileIdx) {
        body.guessFileIdx = guessFileIdx;
    }
    return fetch(url.resolve(streamingServerURL, '/' + encodeURIComponent(infoHash) + '/create'), {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify(body)
    }).then(function(resp) {
        return resp.json();
    })
}

module.exports = createTorrent;
