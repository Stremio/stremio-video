var url = require('url');
var magnet = require('magnet-uri');
var inferTorrentFileIdx = require('./inferTorrentFileIdx');

function convertStream(streamingServerURL, stream, seriesInfo) {
    return new Promise(function(resolve, reject) {
        if (typeof stream.url === 'string') {
            if (stream.url.indexOf('magnet:') === 0) {
                var parsedMagnetURI;
                try {
                    parsedMagnetURI = magnet.decode(stream.url);
                    if (!parsedMagnetURI || typeof parsedMagnetURI.infoHash !== 'string') {
                        reject(new Error('Failed to decode magnet url'));
                        return;
                    }
                } catch (error) {
                    reject(error);
                    return;
                }

                var sources = Array.isArray(parsedMagnetURI.announce) ?
                    parsedMagnetURI.announce.map(function(source) {
                        return 'tracker:' + source;
                    })
                    :
                    [];
                inferTorrentFileIdx(streamingServerURL, parsedMagnetURI.infoHash, sources, seriesInfo)
                    .then(function(fileIdx) {
                        resolve(url.resolve(streamingServerURL, '/' + encodeURIComponent(stream.infoHash) + '/' + encodeURIComponent(fileIdx)));
                    })
                    .catch(function(error) {
                        reject(error);
                    });
            } else {
                resolve(stream.url);
            }

            return;
        }

        if (typeof stream.infoHash === 'string') {
            if (stream.fileIdx !== null && isFinite(stream.fileIdx)) {
                resolve(url.resolve(streamingServerURL, '/' + encodeURIComponent(stream.infoHash) + '/' + encodeURIComponent(stream.fileIdx)));
            } else {
                inferTorrentFileIdx(streamingServerURL, stream.infoHash, stream.announce, seriesInfo)
                    .then(function(fileIdx) {
                        resolve(url.resolve(streamingServerURL, '/' + encodeURIComponent(stream.infoHash) + '/' + encodeURIComponent(fileIdx)));
                    })
                    .catch(function(error) {
                        reject(error);
                    });
            }

            return;
        }

        reject(new Error('Stream cannot be converted'));
    });
}

module.exports = convertStream;
