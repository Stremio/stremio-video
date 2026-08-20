// from: https://github.com/silviapfeiffer/silviapfeiffer.github.io/blob/master/index.html#L150-L216

function srt2webvtt(data) {
    // remove dos newlines
    var srt = data.replace(/\r+/g, '');
    // trim white space start and end
    srt = srt.replace(/^\s+|\s+$/g, '');
    // get cues
    var cuelist = srt.split('\n\n');
    var result = '';
    if (cuelist.length > 0) {
        result += 'WEBVTT\n\n';
        for (var i = 0; i < cuelist.length; i = i + 1) {
            result += convertSrtCue(cuelist[i]);
        }
    }
    return result;
}

function convertSrtCue(caption) {
    // remove all html tags for security reasons
    caption = caption.replace(/<[a-zA-Z/][^>]*>/g, '');

    var cue = '';
    var s = caption.split(/\n/);
    // concatenate muilt-line string separated in array into one
    while (s.length > 3) {
        for (var i = 3; i < s.length; i++) {
            s[2] += '\n' + s[i];
        }
        s.splice(3, s.length - 3);
    }
    var line = 0;
    // detect identifier
    if (!s[0].match(/\d+:\d+:\d+/) && s[1].match(/\d+:\d+:\d+/)) {
        cue += s[0].match(/\w+/) + '\n';
        line += 1;
    }
    // get time strings
    if (s[line].match(/\d+:\d+:\d+/)) {
        // convert time string
        var m = s[1].match(/(\d+):(\d+):(\d+)(?:,(\d+))?\s*--?>\s*(\d+):(\d+):(\d+)(?:,(\d+))?/);
        if (m) {
            cue += m[1] + ':' + m[2] + ':' + m[3] + '.' + m[4] + ' --> '
                + m[5] + ':' + m[6] + ':' + m[7] + '.' + m[8] + '\n';
            line += 1;
        } else {
            // Unrecognized timestring
            return '';
        }
    } else {
        // file format error or comment lines
        return '';
    }
    // get cue text
    if (s[line]) {
        cue += s[line] + '\n\n';
    }
    return cue;
}

function splitASSFields(value, count) {
    var fields = [];
    var offset = 0;

    for (var i = 0; i < count - 1; i++) {
        var separator = value.indexOf(',', offset);
        if (separator === -1) {
            return null;
        }

        fields.push(value.slice(offset, separator));
        offset = separator + 1;
    }

    fields.push(value.slice(offset));
    return fields;
}

function convertASSTime(value) {
    var match = value.trim().match(/^(\d+):(\d{1,2}):(\d{1,2})(?:[.,](\d+))?$/);
    if (!match) {
        return null;
    }

    var hours = match[1].padStart(2, '0');
    var minutes = match[2].padStart(2, '0');
    var seconds = match[3].padStart(2, '0');
    var milliseconds = (match[4] || '0').padEnd(3, '0').slice(0, 3);
    return hours + ':' + minutes + ':' + seconds + '.' + milliseconds;
}

function convertASSText(value) {
    var drawing = false;
    var text = value.split(/(\{[^}]*\})/).reduce(function(result, part) {
        if (part.startsWith('{') && part.endsWith('}')) {
            var drawingMode;
            var drawingPattern = /\\p(\d+)/ig;
            while ((drawingMode = drawingPattern.exec(part)) !== null) {
                drawing = parseInt(drawingMode[1], 10) > 0;
            }
            return result;
        }

        return drawing ? result : result + part;
    }, '');

    return text
        .replace(/\\[Nn]/g, '\n')
        .replace(/\\h/g, ' ')
        .replace(/<[a-zA-Z/][^>]*>/g, '')
        .replace(/&/g, '&amp;')
        .trim();
}

function ass2webvtt(data) {
    var lines = data.replace(/\r+/g, '').split('\n');
    var inEvents = false;
    var format = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
    var cues = [];

    lines.forEach(function(line) {
        var section = line.match(/^\s*\[([^\]]+)\]\s*$/);
        if (section) {
            inEvents = section[1].trim().toLowerCase() === 'events';
            return;
        }
        if (!inEvents) {
            return;
        }

        var formatMatch = line.match(/^\s*Format\s*:\s*(.*)$/i);
        if (formatMatch) {
            format = formatMatch[1].split(',').map(function(field) {
                return field.trim().toLowerCase();
            });
            return;
        }

        var dialogueMatch = line.match(/^\s*Dialogue\s*:\s*(.*)$/i);
        if (!dialogueMatch) {
            return;
        }

        var fields = splitASSFields(dialogueMatch[1], format.length);
        var startIndex = format.indexOf('start');
        var endIndex = format.indexOf('end');
        var textIndex = format.indexOf('text');
        if (!fields || startIndex === -1 || endIndex === -1 || textIndex === -1) {
            return;
        }

        var start = convertASSTime(fields[startIndex]);
        var end = convertASSTime(fields[endIndex]);
        var text = convertASSText(fields[textIndex]);
        if (start && end && text) {
            cues.push(start + ' --> ' + end + '\n' + text);
        }
    });

    if (cues.length === 0) {
        throw new Error('Missing ASS subtitle track cues');
    }

    return 'WEBVTT\n\n' + cues.join('\n\n') + '\n\n';
}

module.exports = {
    convert: function(text, format) {
        if (format === 'ass') {
            return ass2webvtt(text);
        }

        // presume all to be SRT if not WEBVTT
        if (text.includes('WEBVTT')) {
            return text;
        }

        try {
            return srt2webvtt(text);
        } catch (error) {
            throw new Error('Failed to convert srt to webvtt: ' + error.message);
        }
    },
    convertASS: ass2webvtt
};
