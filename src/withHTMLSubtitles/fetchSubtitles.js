var ERROR = require('../error');
var subtitlesParser = require('./subtitlesParser');

function fetchSubtitles(track) {
    return fetch(track.url)
        .then(function(resp) {
            return resp.text();
        })
        .catch(function(error) {
            throw Object.assign({}, ERROR.WITH_HTML_SUBTITLES.FETCH_FAILED, {
                track: track,
                error: error
            });
        })
        .then(function(text) {
            return subtitlesParser.parse(text);
        })
        .catch(function(error) {
            throw Object.assign({}, ERROR.WITH_HTML_SUBTITLES.PARSE_FAILED, {
                track: track,
                error: error
            });
        });
}

module.exports = fetchSubtitles;
