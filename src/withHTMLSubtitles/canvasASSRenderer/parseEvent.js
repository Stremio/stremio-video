var parseScript = require('./parseScript');
var parseDrawing = require('./drawing').parseDrawing;

var TAG_NAMES = ['xbord', 'ybord', 'xshad', 'yshad', 'fax', 'fay', 'iclip', 'blur', 'fscx', 'fscy', 'fsc', 'fsp', 'fs', 'bord', 'move', 'frx', 'fry', 'frz', 'fr', 'fn', 'alpha', 'an', 'a', 'pos', 'fade', 'fad', 'org', 't', 'clip', 'c', '1c', '2c', '3c', '4c', '1a', '2a', '3a', '4a', 'r', 'be', 'b', 'i', 'kt', 'kf', 'K', 'ko', 'k', 'shad', 's', 'u', 'pbo', 'p', 'q', 'fe'];
var COMPLEX_TAGS = { iclip: true, move: true, pos: true, fade: true, fad: true, org: true, t: true, clip: true };
var KARAOKE_TYPES = { k: 1, kf: 2, K: 2, ko: 3 };
var COLOR_KEYS = { c: 'primary', '1c': 'primary', '2c': 'secondary', '3c': 'outline', '4c': 'back', '1a': 'primary', '2a': 'secondary', '3a': 'outline', '4a': 'back' };

function pushArg(args, value) {
    value = value.trim();
    if (value.length > 0) {
        args.push(value);
    }
}

function parseTags(block) {
    var tags = [];
    var end = block.length;
    var index = 0;
    while (index < end) {
        var p = block.indexOf('\\', index);
        if (p === -1) {
            break;
        }
        p++;
        while (p < end && block[p] === ' ') p++;
        var q = p;
        while (q < end && block[q] !== '(' && block[q] !== '\\') q++;
        index = q;
        if (q === p) {
            continue;
        }

        var nameEnd = q;
        var args = [];
        var hasBackslash = false;
        if (block[q] === '(') {
            q++;
            while (true) {
                while (q < end && block[q] === ' ') q++;
                var r = q;
                while (r < end && block[r] !== ',' && block[r] !== '\\' && block[r] !== ')') r++;
                if (block[r] === ',') {
                    pushArg(args, block.slice(q, r));
                    q = r + 1;
                } else {
                    if (block[r] === '\\') {
                        hasBackslash = true;
                        var paren = block.indexOf(')', r);
                        r = paren === -1 ? end : paren;
                    }
                    pushArg(args, block.slice(q, r));
                    q = r < end ? r + 1 : r;
                    break;
                }
            }
            index = q;
        }
        for (var i = 0; i < TAG_NAMES.length; i++) {
            var name = TAG_NAMES[i];
            if (block.startsWith(name, p) && p + name.length <= nameEnd) {
                if (!COMPLEX_TAGS[name]) {
                    pushArg(args, block.slice(p + name.length, nameEnd));
                }
                tags.push({
                    name: name,
                    args: args,
                    inner: name === 't' && hasBackslash && args.length <= 4 ? parseTags(args[args.length - 1]) : null
                });
                break;
            }
        }
    }
    return tags;
}

function getTransformTimes(tag, duration) {
    var args = tag.args;
    var count = args.length - 1;
    var times = { t1: 0, t2: 0, accel: 1 };
    if (count === 3) {
        times.t1 = parseInt(args[0], 10) || 0;
        times.t2 = parseInt(args[1], 10) || 0;
        times.accel = parseFloat(args[2]) || 0;
    } else if (count === 2) {
        times.t1 = Math.round(parseFloat(args[0]) || 0);
        times.t2 = Math.round(parseFloat(args[1]) || 0);
    } else if (count === 1) {
        times.accel = parseFloat(args[0]) || 0;
    }
    if (times.t2 === 0) {
        times.t2 = duration;
    }
    return times;
}

function compileEvent(event) {
    var text = event.text;
    var duration = event.end - event.start;
    var items = [];
    var intervals = [];
    var steps = [];
    var karaokeStart = 0;
    var karaokeDuration = 0;
    var hasOrigin = false;
    var hasTransform = false;
    var hasMotion = false;
    var move = null;
    var buffer = '';
    var index = 0;

    function addInterval(t1, t2) {
        if (t2 > t1) {
            intervals.push(t1, t2);
        } else {
            steps.push(t1);
        }
    }

    function flush() {
        if (buffer.length > 0) {
            items.push({ text: buffer, drawing: undefined });
            buffer = '';
        }
    }

    while (index < text.length) {
        var brace = text.indexOf('{', index);
        var slash = text.indexOf('\\', index);
        var next = brace === -1 ? slash : slash === -1 ? brace : Math.min(brace, slash);
        if (next === -1) {
            buffer += text.slice(index);
            break;
        }
        buffer += text.slice(index, next);
        if (next === slash) {
            var code = text[next + 1];
            if (code === 'h') {
                buffer += '\u00A0';
            } else if (code === 'N' || code === 'n') {
                flush();
                items.push({ lineBreak: code === 'N' ? 2 : 1 });
            } else {
                buffer += '\\';
                index = next + 1;
                continue;
            }
            index = next + 2;
            continue;
        }
        var end = text.indexOf('}', next);
        if (end === -1) {
            buffer += text.slice(next);
            break;
        }
        var block = text.slice(next + 1, end);
        index = end + 1;
        if (block.indexOf('\\') === -1) {
            continue;
        }
        flush();
        var tags = parseTags(block);
        items.push({ tags: tags });
        for (var i = 0; i < tags.length; i++) {
            var tag = tags[i];
            if (tag.name === 't' && tag.inner !== null) {
                var times = getTransformTimes(tag, duration);
                addInterval(times.t1, times.t2);
                hasTransform = true;
            } else if (tag.name === 'fad' || tag.name === 'fade') {
                hasMotion = true;
            } else if (KARAOKE_TYPES[tag.name]) {
                karaokeStart += karaokeDuration;
                karaokeDuration = (tag.args.length > 0 ? parseFloat(tag.args[0]) || 0 : 100) * 10;
                if (KARAOKE_TYPES[tag.name] === 2) {
                    addInterval(karaokeStart, karaokeStart + karaokeDuration);
                } else {
                    steps.push(karaokeStart);
                }
            } else if (tag.name === 'kt') {
                karaokeStart = (parseFloat(tag.args[0]) || 0) * 10;
                karaokeDuration = 0;
            } else if (tag.name === 'org' && tag.args.length === 2) {
                hasOrigin = true;
            } else if (tag.name === 'move' && move === null && (tag.args.length === 4 || tag.args.length === 6)) {
                move = tag.args.length === 6 ? [parseInt(tag.args[4], 10) || 0, parseInt(tag.args[5], 10) || 0] : [0, 0];
                hasMotion = true;
            }
        }
    }
    flush();
    if (hasOrigin && move !== null) {
        if (move[0] <= 0 && move[1] <= 0) {
            move = [0, duration];
        }
        addInterval(Math.min(move[0], move[1]), Math.max(move[0], move[1]));
    }
    var dynamic = intervals.length > 0 || steps.length > 0;
    return { items: items, intervals: intervals, steps: steps, dynamic: dynamic, animated: dynamic || hasMotion, collisions: !hasTransform && !hasOrigin };
}

function lerp(from, to, pwr) {
    return from * (1 - pwr) + to * pwr;
}

function parseHex(value) {
    var number = parseInt(String(value).replace(/^[&hH]+/, ''), 16);
    return isNaN(number) ? 0 : number;
}

function changeColor(color, value, pwr) {
    return { r: Math.round(lerp(color.r, value.r, pwr)), g: Math.round(lerp(color.g, value.g, pwr)), b: Math.round(lerp(color.b, value.b, pwr)), a: color.a };
}

function changeAlpha(color, alpha, pwr) {
    return { r: color.r, g: color.g, b: color.b, a: Math.round(lerp(color.a, alpha & 255, pwr)) };
}

function createState(style) {
    return {
        fontName: style.fontName, fontSize: style.fontSize, weight: style.bold, italic: style.italic, underline: style.underline, strike: style.strike,
        scaleX: style.scaleX, scaleY: style.scaleY, spacing: style.spacing, frx: 0, fry: 0, frz: style.angle, fax: 0, fay: 0,
        primary: style.primary, secondary: style.secondary, outline: style.outline, back: style.back,
        borderX: style.border, borderY: style.border, shadowX: style.shadow, shadowY: style.shadow, blur: 0, be: 0
    };
}

function applyTags(tags, pwr, nested, env) {
    var state = env.state;
    var result = env.result;
    for (var i = 0; i < tags.length; i++) {
        var tag = tags[i];
        var args = tag.args;
        var has = args.length > 0;
        var value = has ? parseFloat(args[0]) || 0 : 0;
        var integer = has ? parseInt(args[0], 10) || 0 : 0;
        var style = env.style;
        switch (tag.name) {
            case 'xbord':
                state.borderX = has ? Math.max(0, lerp(state.borderX, value, pwr)) : style.border;
                break;
            case 'ybord':
                state.borderY = has ? Math.max(0, lerp(state.borderY, value, pwr)) : style.border;
                break;
            case 'bord':
                state.borderX = has ? Math.max(0, lerp(state.borderX, value, pwr)) : style.border;
                state.borderY = has ? Math.max(0, lerp(state.borderY, value, pwr)) : style.border;
                break;
            case 'xshad':
                state.shadowX = has ? lerp(state.shadowX, value, pwr) : style.shadow;
                break;
            case 'yshad':
                state.shadowY = has ? lerp(state.shadowY, value, pwr) : style.shadow;
                break;
            case 'shad':
                state.shadowX = has ? Math.max(0, lerp(state.shadowX, value, pwr)) : style.shadow;
                state.shadowY = has ? Math.max(0, lerp(state.shadowY, value, pwr)) : style.shadow;
                break;
            case 'fax':
            case 'fay':
            case 'frx':
            case 'fry':
                state[tag.name] = has ? lerp(state[tag.name], value, pwr) : 0;
                break;
            case 'frz':
            case 'fr':
                state.frz = has ? lerp(state.frz, value, pwr) : style.angle;
                break;
            case 'clip':
            case 'iclip':
                if (args.length === 4) {
                    var from = result.clip || { x1: 0, y1: 0, x2: env.script.playResX, y2: env.script.playResY };
                    result.clip = {
                        x1: lerp(from.x1, parseInt(args[0], 10) || 0, pwr),
                        y1: lerp(from.y1, parseInt(args[1], 10) || 0, pwr),
                        x2: lerp(from.x2, parseInt(args[2], 10) || 0, pwr),
                        y2: lerp(from.y2, parseInt(args[3], 10) || 0, pwr),
                        inverse: tag.name === 'iclip'
                    };
                } else if (result.vectorClip === null && (args.length === 1 || args.length === 2)) {
                    var clipDrawing = parseDrawing(args[args.length - 1]);
                    if (clipDrawing !== null) {
                        result.vectorClip = { drawing: clipDrawing, scale: args.length === 2 ? Math.max(1, integer) : 1, inverse: tag.name === 'iclip' };
                    }
                }
                break;
            case 'blur':
                state.blur = has ? Math.min(100, Math.max(0, lerp(state.blur, value, pwr))) : 0;
                break;
            case 'be':
                state.be = has ? Math.min(127, Math.max(0, Math.floor(lerp(state.be, value, pwr) + 0.5))) : 0;
                break;
            case 'fscx':
                state.scaleX = has ? Math.max(0, lerp(state.scaleX, value, pwr)) : style.scaleX;
                break;
            case 'fscy':
                state.scaleY = has ? Math.max(0, lerp(state.scaleY, value, pwr)) : style.scaleY;
                break;
            case 'fsc':
                state.scaleX = style.scaleX;
                state.scaleY = style.scaleY;
                break;
            case 'fsp':
                state.spacing = has ? lerp(state.spacing, value, pwr) : style.spacing;
                break;
            case 'fs':
                var size = has ? (args[0][0] === '+' || args[0][0] === '-' ? state.fontSize * (1 + pwr * value / 10) : lerp(state.fontSize, value, pwr)) : 0;
                state.fontSize = size > 0 ? size : style.fontSize;
                break;
            case 'fn':
                state.fontName = has && args[0] !== '0' ? args[0] : style.fontName;
                break;
            case 'move':
                if ((args.length === 4 || args.length === 6) && !result.positioned) {
                    var t1 = args.length === 6 ? parseInt(args[4], 10) || 0 : 0;
                    var t2 = args.length === 6 ? parseInt(args[5], 10) || 0 : 0;
                    if (t1 <= 0 && t2 <= 0) {
                        t1 = 0;
                        t2 = env.duration;
                    }
                    result.move = { x1: parseFloat(args[0]) || 0, y1: parseFloat(args[1]) || 0, x2: parseFloat(args[2]) || 0, y2: parseFloat(args[3]) || 0, t1: Math.min(t1, t2), t2: Math.max(t1, t2) };
                    result.positioned = true;
                }
                break;
            case 'pos':
                if (args.length === 2 && !result.positioned) {
                    result.pos = { x: parseFloat(args[0]) || 0, y: parseFloat(args[1]) || 0 };
                    result.positioned = true;
                }
                break;
            case 'org':
                if (args.length === 2 && result.org === null) {
                    result.org = { x: parseFloat(args[0]) || 0, y: parseFloat(args[1]) || 0 };
                }
                break;
            case 'fade':
            case 'fad':
                if (result.fade === null && args.length === 2) {
                    result.fade = { a1: 255, a2: 0, a3: 255, t1: 0, t2: parseInt(args[0], 10) || 0, t3: env.duration - (parseInt(args[1], 10) || 0), t4: env.duration };
                } else if (result.fade === null && args.length === 7) {
                    var fade = args.map(function(arg) { return parseInt(arg, 10) || 0; });
                    result.fade = { a1: fade[0], a2: fade[1], a3: fade[2], t1: fade[3], t2: fade[4], t3: fade[5], t4: fade[6] };
                }
                break;
            case 'an':
                if (!result.alignmentSet) {
                    result.alignment = integer >= 1 && integer <= 9 ? integer : style.alignment;
                    result.alignmentSet = true;
                }
                break;
            case 'a':
                if (!result.alignmentSet) {
                    result.alignment = integer >= 1 && integer <= 11 ? parseScript.legacyAlignments[(integer & 3) === 0 ? 5 : integer] : style.alignment;
                    result.alignmentSet = true;
                }
                break;
            case 't':
                if (!nested && tag.inner !== null) {
                    var times = getTransformTimes(tag, env.duration);
                    var progress = env.time < times.t1 ? 0 : env.time >= times.t2 ? 1 : Math.pow((env.time - times.t1) / (times.t2 - times.t1), times.accel);
                    applyTags(tag.inner, progress, true, env);
                }
                break;
            case 'c':
            case '1c':
            case '2c':
            case '3c':
            case '4c':
                state[COLOR_KEYS[tag.name]] = has ?
                    changeColor(state[COLOR_KEYS[tag.name]], parseScript.toColor(parseHex(args[0])), pwr) :
                    changeColor(state[COLOR_KEYS[tag.name]], style[COLOR_KEYS[tag.name]], 1);
                break;
            case '1a':
            case '2a':
            case '3a':
            case '4a':
                state[COLOR_KEYS[tag.name]] = changeAlpha(state[COLOR_KEYS[tag.name]], has ? parseHex(args[0]) : style[COLOR_KEYS[tag.name]].a, has ? pwr : 1);
                break;
            case 'alpha':
                ['primary', 'secondary', 'outline', 'back'].forEach(function(key) {
                    state[key] = changeAlpha(state[key], has ? parseHex(args[0]) : style[key].a, has ? pwr : 1);
                });
                break;
            case 'r':
                env.style = has && env.script.styles[args[0]] ? env.script.styles[args[0]] : env.eventStyle;
                Object.assign(state, createState(env.style));
                break;
            case 'b':
                state.weight = has && (integer === 0 || integer === 1 || integer >= 100) ? (integer === 0 ? 400 : integer === 1 ? 700 : integer) : style.bold;
                break;
            case 'i':
                state.italic = has && (integer === 0 || integer === 1) ? integer === 1 : style.italic;
                break;
            case 'u':
                state.underline = has && (integer === 0 || integer === 1) ? integer === 1 : style.underline;
                break;
            case 's':
                state.strike = has && (integer === 0 || integer === 1) ? integer === 1 : style.strike;
                break;
            case 'kt':
                if (!nested) {
                    env.karaokeStart = value * 10;
                    env.karaokeDuration = 0;
                }
                break;
            case 'k':
            case 'kf':
            case 'K':
            case 'ko':
                if (!nested) {
                    env.karaokeStart += env.karaokeDuration;
                    env.karaokeDuration = (has ? value : 100) * 10;
                    env.karaokeType = KARAOKE_TYPES[tag.name];
                }
                break;
            case 'pbo':
                env.pbo = value;
                break;
            case 'p':
                env.drawing = Math.max(0, integer);
                break;
            case 'q':
                result.wrapStyle = has && integer >= 0 && integer <= 3 ? integer : env.script.wrapStyle;
                break;
        }
    }
}

function evaluateEvent(compiled, event, script, time) {
    var style = script.styles[event.style] || script.styles.Default;
    var result = {
        style: style, alignment: style.alignment, alignmentSet: false, positioned: false, pos: null, move: null, org: null,
        fade: null, clip: null, vectorClip: null, wrapStyle: null, runs: [], first: null
    };
    var env = {
        script: script, eventStyle: style, style: style, state: createState(style), result: result, time: time - event.start, duration: event.end - event.start,
        drawing: 0, pbo: 0, karaokeType: 0, karaokeStart: 0, karaokeDuration: 0
    };
    var items = compiled.items;
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.tags) {
            applyTags(item.tags, 1, false, env);
            continue;
        }

        var run = {
            text: '', drawing: null, state: Object.assign({}, env.state), lineBreak: item.lineBreak || 0, scale: env.drawing, pbo: env.pbo,
            karaokeType: env.karaokeType, karaokeStart: env.karaokeStart, karaokeEnd: env.karaokeStart + env.karaokeDuration
        };
        if (!run.lineBreak && env.drawing > 0) {
            if (item.drawing === undefined) {
                item.drawing = parseDrawing(item.text);
            }
            if (item.drawing === null) {
                continue;
            }
            run.drawing = item.drawing;
        } else if (!run.lineBreak) {
            run.text = item.text;
        }
        if (result.first === null && !run.lineBreak) {
            result.first = run.state;
        }
        result.runs.push(run);
    }
    if (result.first === null) {
        result.first = env.state;
    }
    return result;
}

function getStamp(compiled, time, fps) {
    var phase = 0;
    var intervals = compiled.intervals;
    for (var i = 0; i < intervals.length; i += 2) {
        if (time >= intervals[i + 1]) {
            phase += 2;
        } else if (time >= intervals[i]) {
            return -1 - Math.floor(time * fps / 1000);
        }
    }
    var steps = compiled.steps;
    for (var j = 0; j < steps.length; j++) {
        if (time >= steps[j]) {
            phase++;
        }
    }
    return phase;
}

function getFadeOpacity(fade, time) {
    if (fade === null) {
        return 1;
    }

    var alpha = fade.a3;
    if (time < fade.t1) {
        alpha = fade.a1;
    } else if (time < fade.t2) {
        alpha = fade.a1 + (fade.a2 - fade.a1) * (time - fade.t1) / (fade.t2 - fade.t1);
    } else if (time < fade.t3) {
        alpha = fade.a2;
    } else if (time < fade.t4) {
        alpha = fade.a2 + (fade.a3 - fade.a2) * (time - fade.t3) / (fade.t4 - fade.t3);
    }
    return 1 - Math.max(0, Math.min(255, alpha)) / 255;
}

function getMoveProgress(move, time) {
    return time <= move.t1 ? 0 : time >= move.t2 ? 1 : (time - move.t1) / (move.t2 - move.t1);
}

module.exports = {
    compileEvent: compileEvent,
    evaluateEvent: evaluateEvent,
    getStamp: getStamp,
    getFadeOpacity: getFadeOpacity,
    getMoveProgress: getMoveProgress
};
