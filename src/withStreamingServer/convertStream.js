var url = require('url');
var magnet = require('magnet-uri');
var createTorrent = require('./createTorrent');

function convertStream(streamingServerURL, stream, seriesInfo) {
    return new Promise(function(resolve, reject) {
        var guessFileIdx = false;
        if (stream.fileIdx === null || !isFinite(stream.fileIdx)) {
            guessFileIdx = {};
            if (seriesInfo) {
                if (seriesInfo.season !== null && isFinite(seriesInfo.season)) {
                    guessFileIdx.season = seriesInfo.season;
                }
                if (seriesInfo.episode !== null && isFinite(seriesInfo.episode)) {
                    guessFileIdx.episode = seriesInfo.episode;
                }
            }
        }

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
                createTorrent(streamingServerURL, parsedMagnetURI.infoHash, sources, guessFileIdx)
                    .then(function(resp) {
                        var fileIdx = guessFileIdx ? resp.guessedFileIdx : stream.fileIdx;
                        resolve(url.resolve(streamingServerURL, '/' + encodeURIComponent(parsedMagnetURI.infoHash) + '/' + encodeURIComponent(fileIdx)));
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
            createTorrent(streamingServerURL, stream.infoHash, stream.announce, guessFileIdx)
                .then(function(resp) {
                    var fileIdx = guessFileIdx ? resp.guessedFileIdx : stream.fileIdx;
                    resolve(url.resolve(streamingServerURL, '/' + encodeURIComponent(stream.infoHash) + '/' + encodeURIComponent(fileIdx)));
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
