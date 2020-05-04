var subtitlesParser = require('./subtitlesParser');
var ERROR = require('./error');

function fetchSubtitles(track) {
    return fetch(track.url)
        .then(function(resp) {
            return resp.text();
        })
        .catch(function(error) {
            throw Object.assign({}, ERROR.WITH_HTML_SUBTITLES.FETCH_FAILED, {
                track: track,
                error: error,
                critical: false
            });
        })
        .then(function(text) {
            var cuesByTime = subtitlesParser.parse(text);
            if (cuesByTime.times.length === 0) {
                throw Object.assign({}, ERROR.WITH_HTML_SUBTITLES.PARSE_FAILED, {
                    track: track,
                    error: error,
                    critical: false
                });
            }

            return cuesByTime;
        });
}

module.exports = fetchSubtitles;
