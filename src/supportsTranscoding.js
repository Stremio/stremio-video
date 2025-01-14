var platform = require('./platform');

function supportsTranscoding() {
    if (['Tizen', 'webOS'].includes(platform.get()) || typeof window.qt !== 'undefined') {
        return Promise.resolve(false);
    }
    return Promise.resolve(true);
}

module.exports = supportsTranscoding;
