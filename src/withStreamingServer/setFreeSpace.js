var url = require('url');

function setFreeSpace(streamingServerURL, freeSpace) {
    var endpoint = url.resolve(streamingServerURL, '/setFreeSpace');

    var body = JSON.stringify({
        freeSpace: freeSpace,
    });

    var options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: body,
    };

    return fetch(endpoint, options)
        .then(function(resp) {
            if (resp.ok) {
                return resp.json();
            }

            throw new Error(resp.status + ' (' + resp.statusText + ')');
        });
}

module.exports = setFreeSpace;
