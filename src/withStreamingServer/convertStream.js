var magnet = require('magnet-uri');
var createTorrent = require('./createTorrent');
var createRar = require('./createRar');

function convertStream(streamingServerURL, stream, seriesInfo) {
    return new Promise(function(resolve, reject) {
        if (typeof stream.url === 'string') {
            if (stream.url.indexOf('magnet:') === 0) {
                var parsedMagnetURI;
                try {
                    parsedMagnetURI = magnet.decode(stream.url);
                    if (!parsedMagnetURI || typeof parsedMagnetURI.infoHash !== 'string') {
                        throw new Error('Failed to decode magnet url');
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
                createTorrent(streamingServerURL, parsedMagnetURI.infoHash, null, null, sources, seriesInfo)
                    .then(function(torrent) {
                        resolve({ url: torrent.url, infoHash: torrent.infoHash, fileIdx: torrent.fileIdx, fileMustInclude: torrent.fileMustInclude });
                    })
                    .catch(function(error) {
                        reject(error);
                    });
            } else {
                resolve({ url: stream.url });
            }

            return;
        }

        if (typeof stream.infoHash === 'string') {
            createTorrent(streamingServerURL, stream.infoHash, stream.fileIdx, stream.fileMustInclude, stream.announce, seriesInfo)
                .then(function(torrent) {
                    resolve({ url: torrent.url, infoHash: torrent.infoHash, fileIdx: torrent.fileIdx, fileMustInclude: torrent.fileMustInclude });
                })
                .catch(function(error) {
                    reject(error);
                });

            return;
        }

        if (stream.rarUrls && Array.isArray(stream.rarUrls)) {
            createRar(streamingServerURL, stream.rarUrls, stream.fileIdx, stream.fileMustInclude)
                .then(function(rarStream) {
                    resolve({ url: rarStream.url, fileIdx: rarStream.fileIdx, fileMustInclude: rarStream.fileMustInclude });
                })
                .catch(function(error) {
                    reject(error);
                });

            return;
        }

        reject(new Error('Stream cannot be converted'));
    });
}

module.exports = convertStream;
