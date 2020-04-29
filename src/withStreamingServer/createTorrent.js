var UrlUtils = require('url');

var FETCH_FAILED_CODE = 80;

function createTorrent(streamingServerUrl, infoHash, sources) {
    return fetch(UrlUtils.resolve(streamingServerUrl, `/${encodeURIComponent(infoHash)}/create`), {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            torrent: {
                infoHash: infoHash,
                peerSearch: {
                    sources: [`dht:${infoHash}`].concat(Array.isArray(sources) ? sources : []),
                    min: 40,
                    max: 150
                }
            }
        })
    }).then(function(resp) {
        return resp.json();
    }).catch(function(error) {
        throw {
            code: FETCH_FAILED_CODE,
            message: 'Failed to fetch files from torrent',
            critical: true,
            error: error
        };
    }).then(function(resp) {
        if (!resp || !Array.isArray(resp.files) || resp.files.length === 0) {
            throw {
                code: FETCH_FAILED_CODE,
                message: 'Failed to fetch files from torrent',
                critical: true
            };
        }

        return resp;
    });
}

module.exports = createTorrent;
