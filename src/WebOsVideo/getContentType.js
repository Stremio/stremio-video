function getContentType(stream) {
    if (!stream || typeof stream.url !== 'string') {
        return Promise.reject(new Error('Invalid stream parameter!'));
    }

    if (stream.behaviorHints && stream.behaviorHints.headers && typeof stream.behaviorHints.headers['content-type'] === 'string') {
        return Promise.resolve(stream.behaviorHints.headers['content-type']);
    }

    return fetch(stream.url, { method: 'HEAD' })
        .then(function(resp) {
            if (resp.ok) {
                return resp.headers.get('content-type');
            }

            throw new Error(resp.status + ' (' + resp.statusText + ')');
        });
}

module.exports = getContentType;
