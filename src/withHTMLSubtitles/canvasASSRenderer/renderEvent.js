var buildPath = require('./drawing').buildPath;

var BLUR_SIGMA_SCALE = 2 / Math.sqrt(Math.log(256));
var WORD_PATTERN = /[^ ]+ *| +/g;
var STRONG_PATTERN = /([\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF])|[A-Za-z\u00C0-\u024F\u0370-\u04FF\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/;
var STROKE = 1;
var FILL = 2;

var measureContext = null;
var scratchCanvases = [];

function getMeasureContext() {
    if (measureContext === null) {
        measureContext = document.createElement('canvas').getContext('2d');
    }
    return measureContext;
}

function fitCanvas(canvas, width, height) {
    if (canvas.width < width || canvas.height < height || canvas.width * canvas.height > width * height * 2 + 65536) {
        canvas.width = Math.ceil(width / 32) * 32;
        canvas.height = Math.ceil(height / 32) * 32;
    }
}

function getScratch(index, width, height) {
    var canvas = scratchCanvases[index] || (scratchCanvases[index] = document.createElement('canvas'));
    fitCanvas(canvas, width, height);
    var context = canvas.getContext('2d');
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.textBaseline = 'alphabetic';
    return context;
}

function releaseScratch() {
    scratchCanvases.forEach(function(canvas) {
        canvas.width = 0;
        canvas.height = 0;
    });
    scratchCanvases = [];
}

function toCss(color) {
    return 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + ((255 - color.a) / 255).toFixed(3) + ')';
}

function measure(context, text, state, frame) {
    return (context.measureText(text).width + state.spacing * frame.sx * text.length) * state.scaleX / 100;
}

function tokenize(runs, wrapStyle, frame, fonts) {
    var context = getMeasureContext();
    var paragraphs = [{ tokens: [], state: null }];
    for (var i = 0; i < runs.length; i++) {
        var run = runs[i];
        var paragraph = paragraphs[paragraphs.length - 1];
        run.karaokeWidth = 0;
        if (run.lineBreak === 2 || (run.lineBreak === 1 && wrapStyle === 2)) {
            paragraph.state = paragraph.state || run.state;
            paragraphs.push({ tokens: [], state: null });
            continue;
        }
        var state = run.state;
        var scaleX = state.scaleX / 100;
        var scaleY = state.scaleY / 100;
        if (run.drawing !== null) {
            var unit = 1 / Math.pow(2, run.scale - 1);
            var drawingScaleX = unit * scaleX * frame.sx;
            var drawingScaleY = unit * scaleY * frame.sy;
            var height = (run.drawing.maxY - run.drawing.minY) * drawingScaleY;
            var width = (run.drawing.maxX - run.drawing.minX) * drawingScaleX;
            paragraph.tokens.push({
                run: run, text: '', drawing: run.drawing, path: null, scaleX: drawingScaleX, scaleY: drawingScaleY,
                width: width, coreWidth: width, ascent: height - run.pbo * drawingScaleY, descent: run.pbo * drawingScaleY
            });
            continue;
        }
        var size = state.fontSize * frame.sy;
        var font = fonts.getFont(state, size);
        context.font = font.css;
        var pieces = run.lineBreak === 1 ? [' '] : run.text.match(WORD_PATTERN) || [];
        for (var j = 0; j < pieces.length; j++) {
            var piece = pieces[j];
            var trimmed = piece.replace(/ +$/, '');
            var pieceWidth = measure(context, piece, state, frame);
            paragraph.tokens.push({
                run: run, text: piece, drawing: null, font: font.css, size: size,
                width: pieceWidth, coreWidth: trimmed === piece ? pieceWidth : measure(context, trimmed, state, frame),
                ascent: size * scaleY * font.ascentRatio, descent: size * scaleY * (1 - font.ascentRatio)
            });
        }
    }
    return paragraphs;
}

function breakLines(tokens, maxWidth, wrapStyle) {
    var lines = [];
    var current = [];
    var width = 0;
    tokens.forEach(function(token) {
        if (current.length > 0 && wrapStyle !== 2 && width + token.coreWidth > maxWidth) {
            lines.push(current);
            current = [];
            width = 0;
        }
        current.push(token);
        width += token.width;
    });
    lines.push(current);
    if (lines.length < 2 || wrapStyle === 1 || wrapStyle === 2) {
        return lines;
    }

    var total = tokens.reduce(function(sum, token) { return sum + token.width; }, 0);
    var target = total / lines.length;
    var ordered = wrapStyle === 0 ? tokens.slice().reverse() : tokens;
    var balanced = [];
    current = [];
    width = 0;
    ordered.forEach(function(token) {
        if (current.length > 0 && (width + token.coreWidth > maxWidth || width + token.width > target + token.width / 2)) {
            balanced.push(current);
            current = [];
            width = 0;
        }
        current.push(token);
        width += token.width;
    });
    balanced.push(current);
    if (balanced.length !== lines.length) {
        return lines;
    }
    if (wrapStyle === 0) {
        balanced.reverse();
        balanced.forEach(function(line) { line.reverse(); });
    }
    return balanced;
}

function isRightToLeft(tokens) {
    for (var i = 0; i < tokens.length; i++) {
        var match = STRONG_PATTERN.exec(tokens[i].text);
        if (match !== null) {
            return match[1] !== undefined;
        }
    }
    return false;
}

function layoutEvent(ev, event, script, frame, fonts, position) {
    var style = ev.style;
    var wrapStyle = ev.wrapStyle !== null ? ev.wrapStyle : script.wrapStyle;
    var marginL = (event.marginL || style.marginL) * frame.sx;
    var marginR = (event.marginR || style.marginR) * frame.sx;
    var marginV = (event.marginV || style.marginV) * frame.sy;
    var maxWidth = Math.max(1, frame.width - marginL - marginR);
    var halign = (ev.alignment - 1) % 3;
    var valign = ev.alignment >= 7 ? 0 : ev.alignment >= 4 ? 1 : 2;
    var lines = [];
    tokenize(ev.runs, wrapStyle, frame, fonts).forEach(function(paragraph) {
        if (paragraph.tokens.length === 0) {
            var state = paragraph.state || ev.first;
            lines.push({ tokens: [], width: 0, ascent: state.fontSize * frame.sy * state.scaleY / 100, descent: 0 });
            return;
        }
        breakLines(paragraph.tokens, maxWidth, wrapStyle).forEach(function(tokens) {
            var line = { tokens: tokens, width: 0, ascent: 0, descent: 0 };
            tokens.forEach(function(token, index) {
                line.ascent = Math.max(line.ascent, token.ascent);
                line.descent = Math.max(line.descent, token.descent);
                line.width += index === tokens.length - 1 ? token.coreWidth : token.width;
            });
            lines.push(line);
        });
    });
    var height = 0;
    var width = 0;
    lines.forEach(function(line) {
        line.height = line.ascent + line.descent;
        height += line.height;
        width = Math.max(width, line.width);
    });
    var left;
    var top;
    if (position !== null) {
        left = position.x * frame.sx - (halign === 0 ? 0 : halign === 1 ? width / 2 : width);
        top = position.y * frame.sy - (valign === 0 ? 0 : valign === 1 ? height / 2 : height);
    } else {
        left = halign === 0 ? marginL : halign === 2 ? frame.width - marginR - width : (marginL + frame.width - marginR - width) / 2;
        top = valign === 0 ? marginV : valign === 2 ? frame.height - marginV - height : (frame.height - height) / 2;
    }
    var y = top;
    lines.forEach(function(line) {
        line.x = left + (halign === 0 ? 0 : halign === 1 ? (width - line.width) / 2 : width - line.width);
        line.top = y;
        var rtl = isRightToLeft(line.tokens);
        var x = rtl ? line.x + line.width : line.x;
        line.tokens.forEach(function(token) {
            token.x = rtl ? x - token.coreWidth : x;
            token.baseline = y + line.ascent;
            token.karaokeOffset = token.run.karaokeWidth;
            token.run.karaokeWidth += token.width;
            x += rtl ? -token.width : token.width;
        });
        y += line.height;
    });
    var origin = ev.org !== null ?
        { x: ev.org.x * frame.sx, y: ev.org.y * frame.sy } :
        { x: left + (halign === 0 ? 0 : halign === 1 ? width / 2 : width), y: top + (valign === 0 ? 0 : valign === 1 ? height / 2 : height) };
    return { lines: lines, left: left, top: top, width: width, height: height, origin: origin };
}

function getMatrix(state) {
    var rz = state.frz * Math.PI / 180;
    var rx = state.frx * Math.PI / 180;
    var ry = state.fry * Math.PI / 180;
    var sz = -Math.sin(rz), cz = Math.cos(rz);
    var sx = -Math.sin(rx), cx = Math.cos(rx);
    var sy = Math.sin(ry), cy = Math.cos(ry);
    return [cy * cz - sy * sx * sz, cx * sz, -cy * sz - sy * sx * cz, cx * cz];
}

function getSigma(state, frame) {
    var blur = state.blur * frame.blurScale * BLUR_SIGMA_SCALE;
    return Math.sqrt(blur * blur + state.be / 2);
}

function getKaraokeSplit(token, time) {
    var run = token.run;
    if (run.karaokeType === 0) {
        return token.width;
    }
    if (run.karaokeType !== 2 || run.karaokeEnd <= run.karaokeStart) {
        return time >= run.karaokeStart ? token.width : 0;
    }
    var progress = Math.max(0, Math.min(1, (time - run.karaokeStart) / (run.karaokeEnd - run.karaokeStart)));
    return Math.max(0, Math.min(token.width, progress * run.karaokeWidth - token.karaokeOffset));
}

function prepareTokens(layout, frame, boxed, time) {
    var tokens = [];
    layout.lines.forEach(function(line) {
        line.tokens.forEach(function(token) {
            var state = token.run.state;
            if (!state.scaleX || !state.scaleY) {
                return;
            }
            var border = (state.borderX + state.borderY) / 2 * frame.borderScale;
            var split = getKaraokeSplit(token, time);
            var primaryVisible = split > 0 && state.primary.a < 255;
            var secondaryVisible = split < token.width && state.secondary.a < 255;
            token.line = line;
            token.border = boxed ? 0 : border;
            token.split = split;
            token.sigma = getSigma(state, frame);
            token.spacing = state.spacing * frame.sx;
            token.pad = border + token.sigma * 3 + (token.drawing === null ? token.size * 0.25 : 0) + 2;
            token.fillVisible = primaryVisible || secondaryVisible;
            token.fillOpaque = (split <= 0 || state.primary.a === 0) && (split >= token.width || state.secondary.a === 0);
            token.outlineVisible = token.border > 0 && state.outline.a < 255 && !(token.run.karaokeType === 3 && time < token.run.karaokeStart);
            token.shadowX = state.shadowX * frame.borderScale;
            token.shadowY = state.shadowY * frame.borderScale;
            token.shadowVisible = (token.shadowX !== 0 || token.shadowY !== 0) && state.back.a < 255 && (token.border > 0 || token.fillVisible);
            tokens.push(token);
        });
    });
    return tokens;
}

function getTokenBox(token) {
    if (token.drawing !== null) {
        var top = token.baseline - token.ascent;
        return [token.x + token.drawing.minX * token.scaleX, top + token.drawing.minY * token.scaleY, token.x + token.drawing.maxX * token.scaleX, top + token.drawing.maxY * token.scaleY];
    }
    return [token.x, token.baseline - token.ascent, token.x + token.width, token.baseline + token.descent];
}

function getBounds(tokens, base, shear) {
    var bounds = [Infinity, Infinity, -Infinity, -Infinity];
    tokens.forEach(function(token) {
        var box = getTokenBox(token);
        var line = token.line;
        var pad = token.pad;
        for (var i = 0; i < 4; i++) {
            var x = box[i === 0 || i === 3 ? 0 : 2];
            var y = box[i < 2 ? 1 : 3];
            if (shear !== null) {
                var shearedX = x + shear[0] * (y - line.top);
                y = y + shear[1] * (x - line.x);
                x = shearedX;
            }
            var screenX = base[0] * x + base[2] * y + base[4];
            var screenY = base[1] * x + base[3] * y + base[5];
            var shadowX = token.shadowVisible ? token.shadowX : 0;
            var shadowY = token.shadowVisible ? token.shadowY : 0;
            bounds[0] = Math.min(bounds[0], screenX - pad + Math.min(0, shadowX));
            bounds[1] = Math.min(bounds[1], screenY - pad + Math.min(0, shadowY));
            bounds[2] = Math.max(bounds[2], screenX + pad + Math.max(0, shadowX));
            bounds[3] = Math.max(bounds[3], screenY + pad + Math.max(0, shadowY));
        }
    });
    return bounds;
}

function setTokenTransform(context, base, shear, token, offsetX, offsetY) {
    context.setTransform(base[0], base[1], base[2], base[3], base[4] + offsetX, base[5] + offsetY);
    if (shear !== null) {
        context.transform(1, shear[1], shear[0], 1, -shear[0] * token.line.top, -shear[1] * token.line.x);
    }
}

function drawShape(context, token, mode, lineWidth) {
    if (token.drawing !== null) {
        if (token.path === null) {
            token.path = buildPath(token.drawing, token.scaleX, token.scaleY, token.x, token.baseline - token.ascent, new Path2D());
        }
        if (mode & STROKE) {
            context.lineWidth = lineWidth;
            context.stroke(token.path);
        }
        if (mode & FILL) {
            context.fill(token.path);
        }
        return;
    }

    var state = token.run.state;
    var scaleX = state.scaleX / 100;
    var scaleY = state.scaleY / 100;
    context.font = token.font;
    context.translate(token.x, token.baseline);
    context.scale(scaleX, scaleY);
    context.lineWidth = lineWidth * 2 / (scaleX + scaleY);
    if (!state.spacing) {
        if (mode & STROKE) context.strokeText(token.text, 0, 0);
        if (mode & FILL) context.fillText(token.text, 0, 0);
        return;
    }
    var cursor = 0;
    for (var i = 0; i < token.text.length; i++) {
        var character = token.text[i];
        if (mode & STROKE) context.strokeText(character, cursor, 0);
        if (mode & FILL) context.fillText(character, cursor, 0);
        cursor += context.measureText(character).width + token.spacing;
    }
}

function drawDecorations(context, token) {
    var state = token.run.state;
    var width = token.coreWidth * 100 / state.scaleX;
    var thickness = Math.max(1, token.size * 0.06);
    if (state.underline) {
        context.fillRect(0, token.size * 0.08, width, thickness);
    }
    if (state.strike) {
        context.fillRect(0, -token.size * 0.28, width, thickness);
    }
}

function paintLayer(target, width, height, filterSupported, tokens, sigmaOf, paintToken) {
    var sigma = 0;
    tokens.forEach(function(token) {
        var tokenSigma = filterSupported ? sigmaOf(token) : 0;
        if (tokenSigma > 0) {
            sigma = Math.max(sigma, tokenSigma);
        } else {
            paintToken(target, token);
        }
    });
    if (sigma === 0) {
        return;
    }

    var scratch = getScratch(0, width, height);
    tokens.forEach(function(token) {
        if (sigmaOf(token) > 0) {
            paintToken(scratch, token);
        }
    });
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.filter = 'blur(' + sigma.toFixed(2) + 'px)';
    target.drawImage(scratch.canvas, 0, 0, width, height, 0, 0, width, height);
    target.filter = 'none';
}

function renderEvent(entry, ev, layout, frame, time, limits) {
    var style = ev.style;
    var boxed = style.borderStyle === 3;
    var background = style.borderStyle === 4;
    var tokens = prepareTokens(layout, frame, boxed, time);
    var first = ev.first;
    var matrix = getMatrix(first);
    var origin = layout.origin;
    var shear = first.fax || first.fay ? [first.fax * first.scaleX / (first.scaleY || 1), first.fay * first.scaleY / (first.scaleX || 1)] : null;
    var base = [matrix[0], matrix[1], matrix[2], matrix[3], origin.x - matrix[0] * origin.x - matrix[2] * origin.y, origin.y - matrix[1] * origin.x - matrix[3] * origin.y];
    var bounds = tokens.length > 0 ? getBounds(tokens, base, shear) : null;
    var backgroundBox = null;
    if (bounds !== null && background) {
        var padX = (first.borderX + first.borderY) / 2 * frame.borderScale + Math.max(0, first.shadowX * frame.borderScale);
        var padY = (first.borderX + first.borderY) / 2 * frame.borderScale + Math.max(0, first.shadowY * frame.borderScale);
        backgroundBox = [Infinity, Infinity, -Infinity, -Infinity];
        [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function(corner) {
            var x = layout.left + layout.width * corner[0];
            var y = layout.top + layout.height * corner[1];
            var screenX = base[0] * x + base[2] * y + base[4];
            var screenY = base[1] * x + base[3] * y + base[5];
            backgroundBox[0] = Math.min(backgroundBox[0], screenX - padX);
            backgroundBox[1] = Math.min(backgroundBox[1], screenY - padY);
            backgroundBox[2] = Math.max(backgroundBox[2], screenX + padX);
            backgroundBox[3] = Math.max(backgroundBox[3], screenY + padY);
        });
        bounds = [Math.min(bounds[0], backgroundBox[0]), Math.min(bounds[1], backgroundBox[1]), Math.max(bounds[2], backgroundBox[2]), Math.max(bounds[3], backgroundBox[3])];
    }
    var left = bounds === null ? 0 : Math.floor(Math.max(bounds[0], limits[0]));
    var top = bounds === null ? 0 : Math.floor(Math.max(bounds[1], limits[1]));
    var width = bounds === null ? 0 : Math.ceil(Math.min(bounds[2], limits[2])) - left;
    var height = bounds === null ? 0 : Math.ceil(Math.min(bounds[3], limits[3])) - top;
    entry.left = left;
    entry.top = top;
    if (width <= 0 || height <= 0) {
        entry.canvas = null;
        return;
    }

    var canvas = entry.canvas || document.createElement('canvas');
    fitCanvas(canvas, width, height);
    entry.canvas = canvas;
    entry.width = width;
    entry.height = height;
    var context = canvas.getContext('2d');
    var filterSupported = typeof context.filter === 'string';
    base[4] -= left;
    base[5] -= top;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.textBaseline = 'alphabetic';

    if (backgroundBox !== null) {
        context.fillStyle = toCss(first.back);
        context.fillRect(backgroundBox[0] - left, backgroundBox[1] - top, backgroundBox[2] - backgroundBox[0], backgroundBox[3] - backgroundBox[1]);
    }

    if (boxed) {
        layout.lines.forEach(function(line) {
            if (line.tokens.length === 0) {
                return;
            }
            var state = line.tokens[0].run.state;
            var pad = (state.borderX + state.borderY) / 2 * frame.borderScale;
            var shadowX = state.shadowX * frame.borderScale;
            var shadowY = state.shadowY * frame.borderScale;
            if ((shadowX || shadowY) && state.back.a < 255) {
                setTokenTransform(context, base, shear, line.tokens[0], shadowX, shadowY);
                context.fillStyle = toCss(state.back);
                context.fillRect(line.x - pad, line.top - pad, line.width + pad * 2, line.height + pad * 2);
            }
            setTokenTransform(context, base, shear, line.tokens[0], 0, 0);
            context.fillStyle = toCss(state.outline);
            context.fillRect(line.x - pad, line.top - pad, line.width + pad * 2, line.height + pad * 2);
        });
    } else if (!background) {
        paintLayer(context, width, height, filterSupported, tokens, function(token) {
            return token.shadowVisible ? token.sigma : 0;
        }, function(target, token) {
            if (!token.shadowVisible) {
                return;
            }
            setTokenTransform(target, base, shear, token, token.shadowX, token.shadowY);
            target.fillStyle = target.strokeStyle = toCss(token.run.state.back);
            drawShape(target, token, token.border > 0 ? STROKE | FILL : FILL, token.border * 2);
        });
        context.globalCompositeOperation = 'destination-out';
        context.fillStyle = '#000';
        tokens.forEach(function(token) {
            if (token.shadowVisible && token.border > 0 && !token.fillVisible) {
                setTokenTransform(context, base, shear, token, token.shadowX, token.shadowY);
                drawShape(context, token, FILL, 0);
            }
        });
        context.globalCompositeOperation = 'source-over';
    }

    var hollow = tokens.some(function(token) {
        return token.outlineVisible && !token.fillOpaque;
    });
    var outlineTarget = hollow ? getScratch(1, width, height) : context;
    paintLayer(outlineTarget, width, height, filterSupported, tokens, function(token) {
        return token.outlineVisible ? token.sigma : 0;
    }, function(target, token) {
        if (!token.outlineVisible) {
            return;
        }
        setTokenTransform(target, base, shear, token, 0, 0);
        target.strokeStyle = toCss(token.run.state.outline);
        drawShape(target, token, STROKE, token.border * 2);
    });
    if (hollow) {
        outlineTarget.globalCompositeOperation = 'destination-out';
        outlineTarget.fillStyle = '#000';
        tokens.forEach(function(token) {
            if (token.outlineVisible && !token.fillOpaque) {
                setTokenTransform(outlineTarget, base, shear, token, 0, 0);
                drawShape(outlineTarget, token, FILL, 0);
            }
        });
        outlineTarget.globalCompositeOperation = 'source-over';
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.drawImage(outlineTarget.canvas, 0, 0, width, height, 0, 0, width, height);
    }

    paintLayer(context, width, height, filterSupported, tokens, function(token) {
        return token.fillVisible && token.border === 0 ? token.sigma : 0;
    }, function(target, token) {
        if (!token.fillVisible) {
            return;
        }
        var state = token.run.state;
        var parts = token.split >= token.width ? [[state.primary, 0, token.width]] : token.split <= 0 ? [[state.secondary, 0, token.width]] : [[state.secondary, token.split, token.width], [state.primary, 0, token.split]];
        parts.forEach(function(part) {
            if (part[0].a === 255) {
                return;
            }
            setTokenTransform(target, base, shear, token, 0, 0);
            if (parts.length > 1) {
                target.beginPath();
                target.rect(token.x + part[1], -1e5, part[2] - part[1], 2e5);
                target.save();
                target.clip();
            }
            target.fillStyle = toCss(part[0]);
            drawShape(target, token, FILL, 0);
            if (token.drawing === null && (state.underline || state.strike)) {
                drawDecorations(target, token);
            }
            if (parts.length > 1) {
                target.restore();
            }
        });
    });
}

module.exports = {
    layoutEvent: layoutEvent,
    renderEvent: renderEvent,
    releaseScratch: releaseScratch
};
