var parseVideoName = require('video-name-parser');

var VIDEO_FILE_EXTENTIONS = /.mkv$|.avi$|.mp4$|.wmv$|.vp8$|.mov$|.mpg$|.ts$|.webm$/i;

function guessFileIdx(files, seriesInfo) {
    var videoFilesForEpisode = files.filter(function(file) {
        if (seriesInfo && file.path.match(VIDEO_FILE_EXTENTIONS)) {
            try {
                var info = parseVideoName(file.path);
                return info.season !== null && isFinite(info.season) && info.season === seriesInfo.season &&
                    Array.isArray(info.episode) && info.episode.indexOf(seriesInfo.episode) !== -1;
            } catch (e) {
                return false;
            }
        }

        return false;
    });
    var largestFile = (videoFilesForEpisode.length > 0 ? videoFilesForEpisode : files)
        .reduce((result, file) => {
            if (!result || file.length > result.length) {
                return file;
            }

            return result;
        }, null);
    return files.indexOf(largestFile);
}

module.exports = guessFileIdx;
