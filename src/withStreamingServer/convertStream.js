var url = require('url');
var magnet = require('magnet-uri');
var createTorrent = require('./createTorrent');
var createRar = require('./createRar');
var createZip = require('./createZip');

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

function convertStream(streamingServerURL, stream, seriesInfo, streamingServerSettings) {
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
                var proxyStreamsEnabled = streamingServerSettings && streamingServerSettings.proxyStreamsEnabled;
                var proxyHeaders = stream.behaviorHints && stream.behaviorHints.proxyHeaders;
                if (proxyStreamsEnabled || proxyHeaders) {
                    var requestHeaders = proxyHeaders && proxyHeaders.request ? proxyHeaders.request : {};
                    var responseHeaders = proxyHeaders && proxyHeaders.response ? proxyHeaders.response : {};
                    resolve({ url: buildProxyUrl(streamingServerURL, stream.url, requestHeaders, responseHeaders) });
                } else {
                    resolve({ url: stream.url });
                }
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

        if (stream.zipUrls && Array.isArray(stream.zipUrls)) {
            createZip(streamingServerURL, stream.zipUrls, stream.fileIdx, stream.fileMustInclude)
                .then(function(zipStream) {
                    resolve({ url: zipStream.url, fileIdx: zipStream.fileIdx, fileMustInclude: zipStream.fileMustInclude });
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
