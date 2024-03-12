var url = require('url');

function buildZipStream(streamingServerURL, key, fileIdx, fileMustInclude) {
    var opts = {};
    if (fileIdx && typeof fileIdx === 'number') {
        opts.fileIdx = fileIdx;
    }
    if (fileMustInclude && Array.isArray(fileMustInclude)) {
        opts.fileMustInclude = fileMustInclude;
    }
    return {
        url: url.resolve(streamingServerURL, '/zip/stream?key=' + encodeURIComponent(key) + (Object.keys(opts).length ? 'o=' + encodeURIComponent(JSON.stringify(opts)) : '')),
        fileIdx: fileIdx,
        fileMustInclude: fileMustInclude
    };
}

function createZip(streamingServerURL, zipUrls, fileIdx, fileMustInclude) {
    if (!(zipUrls || []).length) {
        return Promise.reject('No ZIP URLs provided');
    }

    return fetch(url.resolve(streamingServerURL, '/zip/create'), {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify(zipUrls)
    }).then(function(resp) {
        if (resp.ok) {
            return resp.json();
        }

        throw new Error(resp.status + ' (' + resp.statusText + ')');
    }).then(function(resp) {
        if (!resp.key) {
            throw new Error('Could not retrieve ZIP stream key');
        }
        return buildZipStream(streamingServerURL, resp.key, fileIdx, fileMustInclude);
    });
}

module.exports = createZip;
