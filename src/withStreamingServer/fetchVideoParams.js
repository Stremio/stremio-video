var url = require('url');

function fetchOpensubtitlesParams(streamingServerURL, mediaURL, behaviorHints) {
    var hash = behaviorHints && typeof behaviorHints.videoHash === 'string' ? behaviorHints.videoHash : null;
    var size = behaviorHints && isFinite(behaviorHints.videoSize) ? behaviorHints.videoSize : null;
    if (typeof hash === 'string' && size !== null && isFinite(size)) {
        return Promise.resolve({ hash: hash, size: size });
    }

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

            return {
                hash: typeof hash === 'string' ?
                    hash
                    :
                    resp.result && typeof resp.result.hash === 'string' ?
                        resp.result.hash
                        :
                        null,
                size: size !== null && isFinite(size) ?
                    size
                    :
                    resp.result && typeof resp.result.size ?
                        resp.result.size
                        :
                        null
            };
        });
}

function fetchFilename(streamingServerURL, mediaURL, infoHash, fileIdx, behaviorHints) {
    if (behaviorHints && typeof behaviorHints.filename === 'string') {
        return Promise.resolve(behaviorHints.filename);
    }

    if (infoHash) {
        return fetch(url.resolve(streamingServerURL, '/' + encodeURIComponent(infoHash) + '/' + encodeURIComponent(fileIdx) + '/stats.json'))
            .then(function(resp) {
                if (resp.ok) {
                    return resp.json();
                }

                throw new Error(resp.status + ' (' + resp.statusText + ')');
            })
            .then(function(resp) {
                if (!resp || typeof resp.streamName !== 'string') {
                    throw new Error('Could not retrieve filename from torrent');
                }

                return resp.streamName;
            });
    }

    return Promise.resolve(decodeURIComponent(mediaURL.split('/').pop()));
}

function fetchVideoParams(streamingServerURL, mediaURL, infoHash, fileIdx, behaviorHints) {
    var result = { hash: null, size: null, filename: null };
    // these need to be sequential as fetchOpensubtitlesParams
    // ensures engine /stats.json availability
    return fetchOpensubtitlesParams(streamingServerURL, mediaURL, behaviorHints)
        .then(function(res) {
            result.hash = res.hash;
            result.size = res.size;
            return fetchFilename(streamingServerURL, mediaURL, infoHash, fileIdx, behaviorHints);
        })
        .then(function(res) {

            if (res) {
                result.filename = res;
            }

            return result;
        }).catch(function(e) {
            // eslint-disable-next-line no-console
            console.error(e);
        });
}

module.exports = fetchVideoParams;
