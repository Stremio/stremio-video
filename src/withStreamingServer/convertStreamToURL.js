var url = require('url');
var magnet = require('magnet-uri');
var parseVideoName = require('video-name-parser');
var ERROR = require('../error');

var MEDIA_FILE_EXTENTIONS = /.mkv$|.avi$|.mp4$|.wmv$|.vp8$|.mov$|.mpg$|.ts$|.m3u8$|.webm$|.flac$|.mp3$|.wav$|.wma$|.aac$|.ogg$/i;

function inferTorrentFileIdx(streamingServerURL, infoHash, sources, seriesInfo) {
    return fetch(url.resolve(streamingServerURL, '/' + encodeURIComponent(infoHash) + '/create'), {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            torrent: {
                infoHash: infoHash,
                peerSearch: {
                    sources: ['dht:' + infoHash].concat(Array.isArray(sources) ? sources : []),
                    min: 40,
                    max: 150
                }
            }
        })
    }).then(function(resp) {
        return resp.json();
    }).catch(function(error) {
        throw Object.assign({}, ERROR.WITH_STREAMING_SERVER.TORRENT_CREATE_FAILED, {
            infoHash: infoHash,
            sources: sources,
            error: error
        });
    }).then(function(resp) {
        if (!resp || !Array.isArray(resp.files) || resp.files.some(function(file) { return !file || typeof file.path !== 'string' || file.length === null || !isFinite(file.length); })) {
            throw Object.assign({}, ERROR.WITH_STREAMING_SERVER.TORRENT_CREATE_FAILED, {
                infoHash: infoHash,
                sources: sources,
                files: resp.files,
                error: new Error('Invalid files')
            });
        }

        var mediaFiles = resp.files.filter(function(file) {
            return file.path.match(MEDIA_FILE_EXTENTIONS);
        });
        if (mediaFiles.length === 0) {
            throw Object.assign({}, ERROR.WITH_STREAMING_SERVER.NO_MEDIA_FILES_FOUND, {
                infoHash: infoHash,
                sources: sources,
                files: resp.files
            });
        }

        var mediaFilesForEpisode = seriesInfo ?
            mediaFiles.filter(function(file) {
                try {
                    var info = parseVideoName(file.path);
                    return info.season !== null &&
                        isFinite(info.season) &&
                        info.season === seriesInfo.season &&
                        Array.isArray(info.episode) &&
                        info.episode.indexOf(seriesInfo.episode) !== -1;
                } catch (e) {
                    return false;
                }
            })
            :
            [];
        var selectedFile = (mediaFilesForEpisode.length > 0 ? mediaFilesForEpisode : mediaFiles)
            .reduce(function(result, file) {
                if (!result || file.length > result.length) {
                    return file;
                }

                return result;
            }, null);
        return resp.files.indexOf(selectedFile);
    });
}

function convertStreamToURL(streamingServerURL, stream, seriesInfo) {
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
                    inferTorrentFileIdx(streamingServerURL, parsedMagnetURI.infoHash, sources, seriesInfo)
                        .then(function(fileIdx) {
                            resolve(url.resolve(streamingServerURL, '/' + encodeURIComponent(stream.infoHash) + '/' + encodeURIComponent(fileIdx)));
                        })
                        .catch(function(error) {
                            reject(Object.assign({}, error, {
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

        if (typeof stream.infoHash === 'string') {
            if (stream.fileIdx !== null && isFinite(stream.fileIdx)) {
                resolve(url.resolve(streamingServerURL, '/' + encodeURIComponent(stream.infoHash) + '/' + encodeURIComponent(stream.fileIdx)));
                return;
            } else {
                inferTorrentFileIdx(streamingServerURL, stream.infoHash, stream.sources, stream.seriesInfo)
                    .then(function(fileIdx) {
                        resolve(url.resolve(streamingServerURL, '/' + encodeURIComponent(stream.infoHash) + '/' + encodeURIComponent(fileIdx)));
                    })
                    .catch(function(error) {
                        reject(Object.assign({}, error, {
                            stream: stream
                        }));
                    });
                return;
            }
        }

        reject(Object.assign({}, ERROR.WITH_STREAMING_SERVER.STREAM_CONVERT_FAILED, {
            stream: stream
        }));
    });
}

module.exports = convertStreamToURL;
