var url = require('url');

function buildProxyUrl(streamingServerURL, streamURL, requestHeaders, responseHeaders) {
    var parsedStreamURL = new URL(streamURL);
    var proxyOptions = new URLSearchParams();
    proxyOptions.set('d', parsedStreamURL.origin);
    Object.entries(requestHeaders).forEach(function(entry) {
        proxyOptions.append('h', entry[0] + ':' + entry[1]);
    });
    Object.entries(responseHeaders).forEach(function(entry) {
        proxyOptions.append('r', entry[0] + ':' + entry[1]);
    });
    return url.resolve(streamingServerURL, '/proxy/' + proxyOptions.toString() + parsedStreamURL.pathname) + parsedStreamURL.search;
}

module.exports = buildProxyUrl;
