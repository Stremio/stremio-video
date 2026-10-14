var TOKEN_PATTERN = /[mnlbspc]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
var MOVE = 0;
var MOVE_NO_CLOSE = 1;
var LINE = 2;
var BEZIER = 3;
var SPLINE = 4;
var EXTEND = 5;
var OP_MOVE = 0;
var OP_LINE = 1;
var OP_CURVE = 2;
var OP_CLOSE = 3;

function tokenize(text) {
    var parts = String(text).match(TOKEN_PATTERN) || [];
    var nodes = [];
    var command = '';
    var pending = [];
    var number = null;
    var moveSeen = false;
    var splineStart = -1;

    function addPoint(x, y) {
        if (nodes.length === 0) {
            if (command === 'm' || (command === 'n' && moveSeen)) {
                nodes.push({ type: command === 'm' ? MOVE : MOVE_NO_CLOSE, x: x, y: y });
            }
            return;
        }
        switch (command) {
            case 'm':
            case 'n':
                nodes.push({ type: command === 'm' ? MOVE : MOVE_NO_CLOSE, x: x, y: y });
                break;
            case 'l':
                nodes.push({ type: LINE, x: x, y: y });
                break;
            case 'b':
            case 's':
                pending.push({ type: command === 'b' ? BEZIER : SPLINE, x: x, y: y });
                if (pending.length === 3) {
                    if (command === 's') {
                        splineStart = nodes.length;
                        command = 'p';
                    }
                    nodes.push(pending[0], pending[1], pending[2]);
                    pending = [];
                }
                break;
            case 'p':
                if (nodes.length >= 3) {
                    nodes.push({ type: EXTEND, x: x, y: y });
                }
                break;
        }
    }

    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if ('mnlbspc'.indexOf(part) !== -1) {
            command = part;
            pending = [];
            number = null;
            if (part === 'm') {
                moveSeen = true;
            } else if (part === 'c') {
                if (splineStart !== -1) {
                    for (var j = 0; j < 3; j++) {
                        nodes.push({ type: EXTEND, x: nodes[splineStart + j].x, y: nodes[splineStart + j].y });
                    }
                }
                splineStart = -1;
            }
        } else if (number === null) {
            number = parseFloat(part);
        } else {
            addPoint(number, parseFloat(part));
            number = null;
        }
    }
    return nodes;
}

function addCurve(ops, nodes, index, spline, started) {
    var x0 = nodes[index].x, y0 = nodes[index].y;
    var x1 = nodes[index + 1].x, y1 = nodes[index + 1].y;
    var x2 = nodes[index + 2].x, y2 = nodes[index + 2].y;
    var x3 = nodes[index + 3].x, y3 = nodes[index + 3].y;
    if (spline) {
        var x01 = (x1 - x0) / 3, y01 = (y1 - y0) / 3;
        var x12 = (x2 - x1) / 3, y12 = (y2 - y1) / 3;
        var x23 = (x3 - x2) / 3, y23 = (y3 - y2) / 3;
        x0 = x1 + (x12 - x01) / 2;
        y0 = y1 + (y12 - y01) / 2;
        x3 = x2 + (x23 - x12) / 2;
        y3 = y2 + (y23 - y12) / 2;
        x1 += x12;
        y1 += y12;
        x2 -= x12;
        y2 -= y12;
    }
    if (!started) {
        ops.push(OP_MOVE, x0, y0);
    }
    ops.push(OP_CURVE, x1, y1, x2, y2, x3, y3);
}

function parseDrawing(text) {
    var nodes = tokenize(text);
    if (nodes.length === 0) {
        return null;
    }

    var ops = [];
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var pen = nodes[0];
    var started = false;
    for (var i = 0; i < nodes.length;) {
        var node = nodes[i];
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x);
        maxY = Math.max(maxY, node.y);
        if (node.type === MOVE || node.type === MOVE_NO_CLOSE) {
            if (started && node.type === MOVE) {
                ops.push(OP_CLOSE);
                started = false;
            }
            pen = node;
            i++;
        } else if (node.type === LINE) {
            if (!started) {
                ops.push(OP_MOVE, pen.x, pen.y);
            }
            ops.push(OP_LINE, node.x, node.y);
            started = true;
            pen = node;
            i++;
        } else if (node.type === EXTEND) {
            addCurve(ops, nodes, i - 3, true, started);
            started = true;
            pen = node;
            i++;
        } else {
            addCurve(ops, nodes, i - 1, node.type === SPLINE, started);
            for (var j = 1; j < 3; j++) {
                minX = Math.min(minX, nodes[i + j].x);
                minY = Math.min(minY, nodes[i + j].y);
                maxX = Math.max(maxX, nodes[i + j].x);
                maxY = Math.max(maxY, nodes[i + j].y);
            }
            started = true;
            pen = nodes[i + 2];
            i += 3;
        }
    }
    if (started) {
        ops.push(OP_CLOSE);
    }
    return { ops: ops, minX: minX, minY: minY, maxX: maxX, maxY: maxY };
}

function buildPath(drawing, scaleX, scaleY, offsetX, offsetY, path) {
    var ops = drawing.ops;
    for (var i = 0; i < ops.length;) {
        switch (ops[i]) {
            case OP_MOVE:
                path.moveTo(ops[i + 1] * scaleX + offsetX, ops[i + 2] * scaleY + offsetY);
                i += 3;
                break;
            case OP_LINE:
                path.lineTo(ops[i + 1] * scaleX + offsetX, ops[i + 2] * scaleY + offsetY);
                i += 3;
                break;
            case OP_CURVE:
                path.bezierCurveTo(ops[i + 1] * scaleX + offsetX, ops[i + 2] * scaleY + offsetY, ops[i + 3] * scaleX + offsetX, ops[i + 4] * scaleY + offsetY, ops[i + 5] * scaleX + offsetX, ops[i + 6] * scaleY + offsetY);
                i += 7;
                break;
            default:
                path.closePath();
                i += 1;
        }
    }
    return path;
}

module.exports = {
    parseDrawing: parseDrawing,
    buildPath: buildPath
};
