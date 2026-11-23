var LEGACY_ALIGNMENTS = { 1: 1, 2: 2, 3: 3, 5: 7, 6: 8, 7: 9, 9: 4, 10: 5, 11: 6 };
var STYLE_FIELDS = {
    name: 'Name', fontName: 'Fontname', fontSize: 'Fontsize', primary: 'PrimaryColour', secondary: 'SecondaryColour', outline: 'OutlineColour', back: 'BackColour',
    bold: 'Bold', italic: 'Italic', underline: 'Underline', strike: 'StrikeOut', scaleX: 'ScaleX', scaleY: 'ScaleY', spacing: 'Spacing', angle: 'Angle',
    borderStyle: 'BorderStyle', border: 'Outline', shadow: 'Shadow', alignment: 'Alignment', marginL: 'MarginL', marginR: 'MarginR', marginV: 'MarginV'
};
var DEFAULT_STYLE = {
    name: 'Default', fontName: 'Arial', fontSize: 18,
    primary: { r: 255, g: 255, b: 255, a: 0 }, secondary: { r: 255, g: 0, b: 0, a: 0 }, outline: { r: 0, g: 0, b: 0, a: 0 }, back: { r: 0, g: 0, b: 0, a: 0 },
    bold: 400, italic: false, underline: false, strike: false, scaleX: 100, scaleY: 100, spacing: 0, angle: 0,
    borderStyle: 1, border: 2, shadow: 2, alignment: 2, marginL: 20, marginR: 20, marginV: 20
};

function toColor(number) {
    return { r: number & 255, g: (number >>> 8) & 255, b: (number >>> 16) & 255, a: (number >>> 24) & 255 };
}

function parseColor(value, fallback) {
    var text = String(value).trim();
    var number = /^&h/i.test(text) ? parseInt(text.slice(2), 16) : parseInt(text, 10);
    return isNaN(number) ? fallback : toColor(number);
}

function parseWeight(value) {
    var number = parseInt(value, 10);
    return !number ? 400 : number >= 100 ? number : 700;
}

function parseTime(value) {
    var parts = String(value).trim().split(':');
    if (parts.length !== 3) {
        return NaN;
    }

    return Math.round((parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2])) * 1000);
}

function getStyleName(value) {
    return String(value || '').trim().replace(/^\*+/, '');
}

function parseStyle(fields, values) {
    var raw = {};
    fields.forEach(function(field, index) {
        raw[field] = values[index] !== undefined ? values[index].trim() : '';
    });
    var style = Object.assign({}, DEFAULT_STYLE);
    Object.keys(STYLE_FIELDS).forEach(function(key) {
        var value = raw[STYLE_FIELDS[key]];
        if (value === undefined || value === '') {
            return;
        }
        switch (key) {
            case 'name':
                style.name = getStyleName(value);
                break;
            case 'fontName':
                style.fontName = value;
                break;
            case 'primary':
            case 'secondary':
            case 'outline':
            case 'back':
                style[key] = parseColor(value, DEFAULT_STYLE[key]);
                break;
            case 'bold':
                style.bold = parseWeight(value);
                break;
            case 'italic':
            case 'underline':
            case 'strike':
                style[key] = !!parseInt(value, 10);
                break;
            default:
                style[key] = parseFloat(value);
                if (isNaN(style[key])) {
                    style[key] = DEFAULT_STYLE[key];
                }
        }
    });
    if (raw.TertiaryColour !== undefined && raw.OutlineColour === undefined) {
        style.outline = parseColor(raw.TertiaryColour, DEFAULT_STYLE.outline);
        style.alignment = LEGACY_ALIGNMENTS[style.alignment] || style.alignment;
    }
    return style;
}

function parseFields(value) {
    return value.split(',').map(function(field) {
        return field.trim();
    });
}

function parseScript(text) {
    var script = { playResX: 0, playResY: 0, layoutResY: 0, wrapStyle: 0, scaledBorder: false, styles: {}, events: [], maxEnds: [] };
    var section = '';
    var styleFields = null;
    var eventFields = null;
    var lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n|\r/);
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line[0] === '[') {
            section = line.trim().toLowerCase();
            continue;
        }
        var separator = line.indexOf(':');
        if (separator === -1 || line[0] === ';') {
            continue;
        }
        var key = line.slice(0, separator).trim();
        var value = line.slice(separator + 1).trim();
        if (section === '[script info]') {
            if (key === 'PlayResX') script.playResX = parseFloat(value) || 0;
            if (key === 'PlayResY') script.playResY = parseFloat(value) || 0;
            if (key === 'LayoutResY') script.layoutResY = parseFloat(value) || 0;
            if (key === 'WrapStyle') script.wrapStyle = parseInt(value, 10) || 0;
            if (key === 'ScaledBorderAndShadow') script.scaledBorder = /^yes/i.test(value) || parseInt(value, 10) > 0;
        } else if (section === '[v4+ styles]' || section === '[v4 styles]') {
            if (key === 'Format') {
                styleFields = parseFields(value);
            } else if (key === 'Style' && styleFields !== null) {
                var style = parseStyle(styleFields, value.split(','));
                script.styles[style.name] = style;
            }
        } else if (section === '[events]') {
            if (key === 'Format') {
                eventFields = parseFields(value);
            } else if (key === 'Dialogue' && eventFields !== null) {
                var values = value.split(',');
                var event = {};
                for (var j = 0; j < eventFields.length; j++) {
                    event[eventFields[j]] = j === eventFields.length - 1 ? values.slice(j).join(',') : (values[j] || '').trim();
                }
                var start = parseTime(event.Start);
                var end = parseTime(event.End);
                if (isNaN(start) || isNaN(end) || end <= start) {
                    continue;
                }
                script.events.push({
                    index: script.events.length,
                    layer: parseInt(event.Layer || event.Marked, 10) || 0,
                    start: start,
                    end: end,
                    style: getStyleName(event.Style),
                    marginL: parseFloat(event.MarginL) || 0,
                    marginR: parseFloat(event.MarginR) || 0,
                    marginV: parseFloat(event.MarginV) || 0,
                    text: event.Text || '',
                    key: null
                });
            }
        }
    }
    if (!script.playResX && !script.playResY) {
        script.playResX = 384;
        script.playResY = 288;
    } else if (!script.playResX) {
        script.playResX = script.playResY === 1024 ? 1280 : script.playResY * 4 / 3;
    } else if (!script.playResY) {
        script.playResY = script.playResX === 1280 ? 1024 : script.playResX * 3 / 4;
    }
    if (!script.styles.Default) {
        script.styles.Default = Object.assign({}, DEFAULT_STYLE);
    }
    script.events.sort(function(a, b) {
        return a.start - b.start || a.index - b.index;
    });
    var maxEnd = -Infinity;
    for (var k = 0; k < script.events.length; k++) {
        maxEnd = Math.max(maxEnd, script.events[k].end);
        script.maxEnds.push(maxEnd);
    }
    return script;
}

module.exports = {
    parseScript: parseScript,
    toColor: toColor,
    legacyAlignments: LEGACY_ALIGNMENTS
};
