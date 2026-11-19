var url = require('url');

var CREATE_TIMEOUT_MS = 30000;

function isFileIndex(value) {
    return (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') &&
        Number.isSafeInteger(Number(value)) && Number(value) >= 0;
}

function buildTorrent(streamingServerURL, infoHash, fileIdx, sources) {
    var query = Array.isArray(sources) && sources.length > 0 ?
        '?' + new URLSearchParams(sources.map(function(source) {
            return ['tr', source];
        }))
        :
        '';
    return {
        url: url.resolve(streamingServerURL, '/' + encodeURIComponent(infoHash) + '/' + encodeURIComponent(fileIdx)) + query,
        infoHash: infoHash,
        fileIdx: fileIdx,
        sources: sources
    };
}

function createTorrent(streamingServerURL, infoHash, fileIdx, sources, seriesInfo) {
    var guessFileIdx = fileIdx === null || !isFinite(fileIdx);
    if ((!Array.isArray(sources) || sources.length === 0) && !guessFileIdx) {
        return Promise.resolve(buildTorrent(streamingServerURL, infoHash, fileIdx, sources));
    }

    var body = {
        torrent: {
            infoHash: infoHash,
        }
    };

    if (Array.isArray(sources) && sources.length > 0) {
        body.peerSearch = {
            sources: ['dht:' + infoHash].concat(sources.map(function(source) {
                return source.startsWith('tracker:') || source.startsWith('dht:') ? source : 'tracker:' + source;
            })).filter(function(source, index, sources) {
                return sources.indexOf(source) === index;
            }),
            min: 40,
            max: 200
        };
    }

    if (guessFileIdx) {
        body.guessFileIdx = {};
        if (seriesInfo) {
            if (seriesInfo.season !== null && isFinite(seriesInfo.season)) {
                body.guessFileIdx.season = seriesInfo.season;
            }
            if (seriesInfo.episode !== null && isFinite(seriesInfo.episode)) {
                body.guessFileIdx.episode = seriesInfo.episode;
            }
        }
    } else {
        body.guessFileIdx = false;
    }

    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var request = {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify(body)
    };
    if (controller !== null) {
        request.signal = controller.signal;
    }

    var timeout;
    var deadline = new Promise(function(_resolve, reject) {
        timeout = setTimeout(function() {
            reject(new Error('Torrent creation timed out'));
            if (controller !== null) {
                controller.abort();
            }
        }, CREATE_TIMEOUT_MS);
    });
    var response = Promise.resolve().then(function() {
        return fetch(url.resolve(streamingServerURL, '/' + encodeURIComponent(infoHash) + '/create'), request);
    }).then(function(resp) {
        if (!resp.ok) {
            throw new Error('Torrent creation returned HTTP ' + resp.status + ' (' + resp.statusText + ')');
        }

        return resp.text();
    }).then(function(text) {
        if (text.trim() === '') {
            throw new Error('Torrent creation returned an empty response');
        }

        var result = JSON.parse(text);
        var selectedFileIdx = body.guessFileIdx ? result && result.guessedFileIdx : fileIdx;
        if (guessFileIdx && !isFileIndex(selectedFileIdx)) {
            throw new Error('Torrent creation did not select a playable file');
        }

        return buildTorrent(streamingServerURL, infoHash, selectedFileIdx, body.peerSearch ? body.peerSearch.sources : []);
    });
    return Promise.race([response, deadline]).then(function(torrent) {
        clearTimeout(timeout);
        return torrent;
    }, function(error) {
        clearTimeout(timeout);
        error.name = 'TorrentCreateError';
        throw error;
    });
}

module.exports = createTorrent;
