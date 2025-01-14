function supportsTranscoding() {
    if (typeof window.tizen !== 'undefined' || typeof window.webOS !== 'undefined' || typeof window.qt !== 'undefined') {
        return Promise.resolve(false);
    }
    return Promise.resolve(true);
}

module.exports = supportsTranscoding;
