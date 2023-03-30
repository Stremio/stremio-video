var url = require('url');

function fetchOpensubtitlesParams(streamingServerURL, mediaURL, behaviorHints) {
    // TODO handle behaviorHints

    var queryParams = new URLSearchParams([['videoUrl', mediaURL]]);
    return fetch(url.resolve(streamingServerURL, '/opensubHash?' + queryParams.toString()))
        .then(function(resp) {
            if (resp.ok) {
                return resp.json();
            }

            throw new Error(resp.status + ' (' + resp.statusText + ')');
        })
        .then(function(resp) {
            if (resp.error) {
                throw new Error(resp.error);
            }

            return resp.result;
        });
}

function fetchFilename(streamingServerURL, mediaURL, infoHash, fileIdx, behaviorHints) {
    // TODO handle behaviorHints

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

    return Promise.resolve(decodeURIComponent(mediaURL.split('/').pop()));
}

function fetchVideoParams(streamingServerURL, mediaURL, infoHash, fileIdx, behaviorHints) {
    return Promise.allSettled([
        fetchOpensubtitlesParams(streamingServerURL, mediaURL, behaviorHints),
        fetchFilename(streamingServerURL, mediaURL, infoHash, fileIdx, behaviorHints)
    ]).then(function(results) {
        var result = { hash: null, size: null, filename: null };

        if (results[0].status === 'fulfilled') {
            result.hash = typeof results[0].value === 'string' ? results[0].value : null;
            result.size = typeof results[0].size === 'string' ? results[0].size : null;
        } else if (results[0].reason) {
            // eslint-disable-next-line no-console
            console.error(results[0].reason);
        }

        if (results[1].status === 'fulfilled') {
            result.filename = typeof results[1].value === 'string' ? results[1].value : null;
        } else if (results[1].reason) {
            // eslint-disable-next-line no-console
            console.error(results[1].reason);
        }

        return result;
    });
}

module.exports = fetchVideoParams;
