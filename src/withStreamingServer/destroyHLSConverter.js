var url = require('url');

function destroyHLSConverter(streamingServerURL, id) {
    return fetch(url.resolve(streamingServerURL, '/hlsv2/' + encodeURIComponent(id) + '/destroy'));
}

module.exports = destroyHLSConverter;
