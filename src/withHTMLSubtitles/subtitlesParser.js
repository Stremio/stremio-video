var VTTJS = require('vtt.js');
var binarySearchUpperBound = require('./binarySearchUpperBound');

var CRITICAL_ERROR_CODE = 0;
var ASS_TAGS_PATTERN = /\{\\[^}\n]*\}/g;
var ASS_STYLE_PATTERN = /\\([ib])(\d+)/g;

// Turns an ASS override block like {\an8\i1} into the <i>/<b> tags vtt.js renders.
// vtt.js only closes the innermost open tag, so on any change close both and
// reopen them in a fixed order to keep the tags nested.
function assTagsToHTML(tags, style) {
    var italic = style.italic;
    var bold = style.bold;
    var match;
    ASS_STYLE_PATTERN.lastIndex = 0;
    while ((match = ASS_STYLE_PATTERN.exec(tags)) !== null) {
        var value = parseInt(match[2], 10);
        if (match[1] === 'i') {
            italic = value !== 0;
        } else {
            // \b1 is bold, \b0 is not, and other values are weights.
            bold = value === 1 || value >= 700;
        }
    }

    if (italic === style.italic && bold === style.bold) {
        return '';
    }

    var html = (style.bold ? '</b>' : '') + (style.italic ? '</i>' : '') +
        (italic ? '<i>' : '') + (bold ? '<b>' : '');
    style.italic = italic;
    style.bold = bold;
    return html;
}

function parse(text) {
    return new Promise(function(resolve, reject) {
        var parser = new VTTJS.WebVTT.Parser(window, VTTJS.WebVTT.StringDecoder());
        var errors = [];
        var cues = [];
        var cuesByTime = {};

        parser.oncue = function(c) {
            var top = false;
            var style = { italic: false, bold: false };
            var text = c.text
                .replace(ASS_TAGS_PATTERN, function(tags) {
                    top = top || /\\an[789](?![0-9])/.test(tags);
                    return assTagsToHTML(tags, style);
                })
                .replace(/\\[Nn]/g, '\n')
                .replace(/\\h/g, ' ')
                .trim();
            if (text.replace(/<\/?[ib]>/g, '').trim().length === 0) {
                return;
            }

            var cue = {
                startTime: (c.startTime * 1000) | 0,
                endTime: (c.endTime * 1000) | 0,
                text: text,
                top: top
            };
            cues.push(cue);
            cuesByTime[cue.startTime] = cuesByTime[cue.startTime] || [];
            cuesByTime[cue.endTime] = cuesByTime[cue.endTime] || [];
        };

        parser.onparsingerror = function(error) {
            if (error.code === CRITICAL_ERROR_CODE) {
                parser.oncue = null;
                parser.onparsingerror = null;
                parser.onflush = null;
                reject(error);
            } else {
                console.warn('Subtitles parsing error', error);
                errors.push(error);
            }
        };

        parser.onflush = function() {
            cuesByTime.times = Object.keys(cuesByTime)
                .map(function(time) {
                    return parseInt(time, 10);
                })
                .sort(function(t1, t2) {
                    return t1 - t2;
                });
            for (var i = 0; i < cues.length; i++) {
                cuesByTime[cues[i].startTime].push(cues[i]);
                var startTimeIndex = binarySearchUpperBound(cuesByTime.times, cues[i].startTime);
                for (var j = startTimeIndex + 1; j < cuesByTime.times.length; j++) {
                    if (cues[i].endTime <= cuesByTime.times[j]) {
                        break;
                    }

                    cuesByTime[cuesByTime.times[j]].push(cues[i]);
                }
            }

            for (var k = 0; k < cuesByTime.times.length; k++) {
                cuesByTime[cuesByTime.times[k]].sort(function(c1, c2) {
                    return c1.startTime - c2.startTime ||
                        c1.endTime - c2.endTime;
                });
            }

            parser.oncue = null;
            parser.onparsingerror = null;
            parser.onflush = null;
            // we may have multiple parsing errors here, but will only respond with the first
            // if subtitle cues are available, we will not reject the promise
            if (cues.length === 0 && errors.length) {
                reject(errors[0]);
            } else if (cuesByTime.times.length === 0) {
                reject(new Error('Missing subtitle track cues'));
            } else {
                resolve(cuesByTime);
            }
        };

        parser.parse(text);
    });
}

module.exports = {
    parse: parse
};
