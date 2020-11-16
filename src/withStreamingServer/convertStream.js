var url = require('url');
var magnet = require('magnet-uri');
var createTorrent = require('./createTorrent');
var guessFileIdx = require('./guessFileIdx');
var ERROR = require('../error');

function convertStream(streamingServerURL, stream) {
    return new Promise(function(resolve, reject) {
        if (typeof stream.url === 'string') {
            if (stream.url.indexOf('magnet:') === 0) {
                var parsedMagnetURI;
                try {
                    parsedMagnetURI = magnet.decode(stream.url);
                } catch (e) { }
                if (parsedMagnetURI && typeof parsedMagnetURI.infoHash === 'string') {
                    var sources = Array.isArray(parsedMagnetURI.announce) ?
                        parsedMagnetURI.announce.map(function(source) {
                            return 'tracker:' + source;
                        })
                        :
                        [];
                    createTorrent(streamingServerURL, parsedMagnetURI.infoHash, sources)
                        .then(function(resp) {
                            var fileIdx = guessFileIdx(resp.files, stream.seriesInfo);
                            resolve(url.resolve(streamingServerURL, '/' + encodeURIComponent(stream.infoHash) + '/' + encodeURIComponent(fileIdx)));
                        })
                        .catch(function(error) {
                            reject(Object.assign({}, error, {
                                critical: true,
                                stream: stream
                            }));
                        });
                    return;
                }
            } else {
                resolve(stream.url);
                return;
            }
        }

        if (typeof stream.ytId === 'string') {
            resolve(url.resolve(streamingServerURL, '/yt/' + encodeURIComponent(stream.ytId) + '?' + new URLSearchParams([['request', Date.now()]]).toString()));
            return;
        }

        if (typeof stream.infoHash === 'string') {
            if (stream.fileIdx !== null && isFinite(stream.fileIdx)) {
                resolve(url.resolve(streamingServerURL, '/' + encodeURIComponent(stream.infoHash) + '/' + encodeURIComponent(stream.fileIdx)));
                return;
            } else {
                createTorrent(streamingServerURL, stream.infoHash, stream.sources)
                    .then(function(resp) {
                        var fileIdx = guessFileIdx(resp.files, stream.seriesInfo);
                        resolve(url.resolve(streamingServerURL, '/' + encodeURIComponent(stream.infoHash) + '/' + encodeURIComponent(fileIdx)));
                    })
                    .catch(function(error) {
                        reject(Object.assign({}, error, {
                            critical: true,
                            stream: stream
                        }));
                    });
                return;
            }
        }

        reject(Object.assign({}, ERROR.WITH_STREAMING_SERVER.STREAM_CONVERT_FAILED, {
            critical: true,
            stream: stream
        }));
    });
}

module.exports = convertStream;
