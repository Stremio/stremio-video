var url = require('url');

function buildTorrent(streamingServerURL, infoHash, fileIdx, fileMustInclude, sources) {
    var query = Array.isArray(sources) && sources.length > 0 ?
        '?' + new URLSearchParams(sources.map(function(source) {
            return ['tr', source];
        }))
        :
        '';
    query = query + (Array.isArray(fileMustInclude) && fileMustInclude.length > 0 ?
        (query ? '&' : '?') + new URLSearchParams(fileMustInclude.map(function(mustInclude) {
            return ['f', mustInclude];
        }))
        :
        '');
    return {
        url: url.resolve(streamingServerURL, '/' + encodeURIComponent(infoHash) + '/' + encodeURIComponent(fileIdx || -1)) + query,
        infoHash: infoHash,
        fileIdx: fileIdx,
        fileMustInclude: fileMustInclude,
        sources: sources
    };
}

function createTorrent(streamingServerURL, infoHash, fileIdx, fileMustInclude, sources, seriesInfo) {
    if ((!Array.isArray(sources) || sources.length === 0) && ((fileIdx !== null && isFinite(fileIdx)) || (fileMustInclude || []).length)) {
        return Promise.resolve(buildTorrent(streamingServerURL, infoHash, fileIdx, fileMustInclude, sources));
    }

    var body = {
        torrent: {
            infoHash: infoHash,
        }
    };

    if (Array.isArray(sources) && sources.length > 0) {
        body.peerSearch = {
            sources: ['dht:' + infoHash].concat(sources).filter(function(source, index, sources) {
                return sources.indexOf(source) === index;
            }),
            min: 40,
            max: 200
        };
    }

    if ((fileMustInclude || []).length) {
        body.fileMustInclude = fileMustInclude;
    }

    if (fileIdx === null || !isFinite(fileIdx)) {
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

    return fetch(url.resolve(streamingServerURL, '/' + encodeURIComponent(infoHash) + '/create'), {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify(body)
    }).then(function(resp) {
        if (resp.ok) {
            return resp.json();
        }

        throw new Error(resp.status + ' (' + resp.statusText + ')');
    }).then(function(resp) {
        return buildTorrent(streamingServerURL, infoHash, body.guessFileIdx ? resp.guessedFileIdx : fileIdx, fileMustInclude, body.peerSearch ? body.peerSearch.sources : []);
    });
}

module.exports = createTorrent;
