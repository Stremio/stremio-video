var url = require('url');
var magnet = require('magnet-uri');
var createTorrent = require('./createTorrent');

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
                createTorrent(streamingServerURL, parsedMagnetURI.infoHash, null, sources, seriesInfo)
                    .then(function(torrent) {
                        resolve({ url: torrent.url, infoHash: torrent.infoHash, fileIdx: torrent.fileIdx });
                    })
                    .catch(function(error) {
                        reject(error);
                    });
            } else {
                var proxyStreamsEnabled = streamingServerSettings && streamingServerSettings.proxyStreamsEnabled;
                var proxyHeaders = stream.behaviorHints && stream.behaviorHints.proxyHeaders;
                var resolved;
                if (proxyStreamsEnabled || proxyHeaders) {
                    var requestHeaders = proxyHeaders && proxyHeaders.request ? proxyHeaders.request : {};
                    var responseHeaders = proxyHeaders && proxyHeaders.response ? proxyHeaders.response : {};
                    resolved = { url: buildProxyUrl(streamingServerURL, stream.url, requestHeaders, responseHeaders) };
                } else {
                    resolved = { url: stream.url };
                }
                // Propagate infoHash/fileIdx so fetchFilename can hit stats.json
                // instead of leaking the URL fragment as the filename.
                if (typeof stream.infoHash === 'string' && stream.infoHash.length > 0) {
                    resolved.infoHash = stream.infoHash.toLowerCase();
                    if (stream.fileIdx !== null && stream.fileIdx !== undefined && isFinite(stream.fileIdx)) {
                        resolved.fileIdx = stream.fileIdx;
                    }
                } else {
                    // Fallback for addons shipping pre-computed streaming-server URLs.
                    try {
                        var parsed = new URL(stream.url);
                        var parts = parsed.pathname.split('/').filter(Boolean);
                        if (parts.length === 2 && /^[a-f0-9]{40}$/i.test(parts[0]) && /^-?\d+$/.test(parts[1])) {
                            resolved.infoHash = parts[0].toLowerCase();
                            resolved.fileIdx = parseInt(parts[1], 10);
                        }
                    } catch (_e) { /* unparsable URL */ }
                }
                resolve(resolved);
            }

            return;
        }

        if (typeof stream.infoHash === 'string') {
            createTorrent(streamingServerURL, stream.infoHash, stream.fileIdx, stream.announce, seriesInfo)
                .then(function(torrent) {
                    resolve({ url: torrent.url, infoHash: torrent.infoHash, fileIdx: torrent.fileIdx });
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
