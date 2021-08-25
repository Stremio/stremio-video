function getContentType(stream) {
    if (!stream || typeof stream.url !== 'string') {
        return Promise.reject(new Error('Invalid stream parameter!'));
    }

    if (stream.behaviorHints && stream.behaviorHints.headers && typeof stream.behaviorHints.headers['content-type'] === 'string') {
        return Promise.resolve(stream.behaviorHints.headers['content-type']);
    }

    return fetch(stream.url, { method: 'HEAD' })
        .then(function(resp) {
            return resp.headers.get('content-type');
        });
}

module.exports = getContentType;
