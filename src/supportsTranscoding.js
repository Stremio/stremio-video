function supportsTranscoding() {
    if (typeof global.tizen !== 'undefined' || typeof global.webOS !== 'undefined') {
        return Promise.resolve(false);
    }
    return Promise.resolve(true);
}

module.exports = supportsTranscoding;
