var url = require('url');

function wipeAll(streamingServerURL) {
    var endpoint = url.resolve(streamingServerURL, '/wipeAll');

    var options = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        },
    };

    return fetch(endpoint, options)
        .then(function(resp) {
            if (resp.ok) {
                return resp.json();
            }

            throw new Error(resp.status + ' (' + resp.statusText + ')');
        });
}

module.exports = wipeAll;
