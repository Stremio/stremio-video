var subtitlesParser = require('./subtitlesParser');

var FETCH_FAILED_CODE = 70;
var PARSE_FAILED_CODE = 71;

function fetchSubtitles(track) {
    return fetch(track.url)
        .then(function(resp) {
            return resp.text();
        })
        .catch(function(error) {
            throw {
                code: FETCH_FAILED_CODE,
                message: 'Failed to fetch subtitles from ' + track.origin,
                track: track,
                error: error
            };
        })
        .then(function(text) {
            var cuesByTime = subtitlesParser.parse(text);
            if (cuesByTime.times.length === 0) {
                throw {
                    code: PARSE_FAILED_CODE,
                    message: 'Failed to parse subtitles from ' + track.origin,
                    track: track,
                    error: error
                };
            }

            return cuesByTime;
        });
}

module.exports = fetchSubtitles;
