var url = require('url');

function buildRarStream(streamingServerURL, key, fileIdx, fileMustInclude) {
    var opts = {};
    if (fileIdx && typeof fileIdx === 'number') {
        opts.fileIdx = fileIdx;
    }
    if (fileMustInclude && Array.isArray(fileMustInclude)) {
        opts.fileMustInclude = fileMustInclude;
    }
    return {
        url: url.resolve(streamingServerURL, '/rar/stream?key=' + encodeURIComponent(key) + (Object.keys(opts).length ? 'o=' + encodeURIComponent(JSON.stringify(opts)) : '')),
        fileIdx: fileIdx,
        fileMustInclude: fileMustInclude
    };
}

function createRar(streamingServerURL, rarUrls, fileIdx, fileMustInclude) {
    if (!(rarUrls || []).length) {
        return Promise.reject('No RAR URLs provided');
    }

    return fetch(url.resolve(streamingServerURL, '/rar/create'), {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify(rarUrls)
    }).then(function(resp) {
        if (resp.ok) {
            return resp.json();
        }

        throw new Error(resp.status + ' (' + resp.statusText + ')');
    }).then(function(resp) {
        if (!resp.key) {
            throw new Error('Could not retrieve RAR stream key');
        }
        return buildRarStream(streamingServerURL, resp.key, fileIdx, fileMustInclude);
    });
}

module.exports = createRar;
