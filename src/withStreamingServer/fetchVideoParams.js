var url = require('url');

function fetchVideoParams(streamingServerURL, mediaURL) {
    var queryParams = new URLSearchParams([['videoUrl', mediaURL]]);
    return fetch(url.resolve(streamingServerURL, '/opensubHash?' + queryParams.toString()))
        .then(function(resp) {
            if (resp.ok) {
                return resp.json();
            }

            throw new Error(resp.status + ' (' + resp.statusText + ')');
        })
        .then(function(resp) {
            if (resp.error) {
                throw new Error(resp.error);
            }

            return resp.result;
        });
}

module.exports = fetchVideoParams;
