var url = require('url');

function resolveStreamingServerEndpoint(streamingServerURL, endpoint) {
    var baseURL = url.parse(streamingServerURL);
    baseURL.pathname = baseURL.pathname || '/';
    if (baseURL.pathname.slice(-1) !== '/') {
        baseURL.pathname += '/';
    }

    return url.resolve(url.format(baseURL), endpoint.replace(/^\/+/, ''));
}

module.exports = resolveStreamingServerEndpoint;
