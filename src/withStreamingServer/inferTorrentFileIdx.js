var url = require('url');
var parseVideoName = require('video-name-parser');

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
    }).then(function(resp) {
        if (!resp || !Array.isArray(resp.files) || resp.files.some(function(file) { return !file || typeof file.path !== 'string' || file.length === null || !isFinite(file.length); })) {
            throw new Error('No files found in the torrent');
        }

        var mediaFiles = resp.files.filter(function(file) {
            return file.path.match(MEDIA_FILE_EXTENTIONS);
        });
        if (mediaFiles.length === 0) {
            throw new Error('No media files found in the torrent');
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

module.exports = inferTorrentFileIdx;
