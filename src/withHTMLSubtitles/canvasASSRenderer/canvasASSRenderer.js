var getContentRect = require('../getContentRect');
var parseScript = require('./parseScript').parseScript;
var parseEvent = require('./parseEvent');
var renderEvent = require('./renderEvent');
var buildPath = require('./drawing').buildPath;
var createFontRegistry = require('./fonts');

var TARGET_FPS = 24;
var MAX_RENDER_HEIGHT = 1080;
var RECT_CHECK_INTERVAL = 1000;

function getEventKey(event) {
    if (event.key === null) {
        event.key = event.start + ',' + event.end + ',' + event.layer + ',' + event.style + ',' + event.marginL + ',' + event.marginR + ',' + event.marginV + ',' + event.text;
    }
    return event.key;
}

function sortEntries(a, b) {
    return a.event.layer - b.event.layer || a.event.index - b.event.index;
}

function createCanvasASSRenderer(options) {
    options = options || {};

    var containerElement = options.containerElement;
    if (!(containerElement instanceof HTMLElement)) {
        throw new Error('Container element required to be instance of HTMLElement');
    }

    var fontRegistry = createFontRegistry(invalidate);
    var canvas = null;
    var context = null;
    var script = null;
    var activeTrack = null;
    var resizeObserver = null;
    var resizeRafId = null;
    var renderRafId = null;
    var delay = 0;
    var rate = 1;
    var opacity = 1;
    var lastTime = null;
    var lastRectCheck = 0;
    var lastComposeAt = 0;
    var layoutKey = null;
    var version = 0;
    var dirty = false;
    var validFrom = Infinity;
    var validTo = -Infinity;
    var entries = {};
    var active = [];
    var animated = false;
    var drawnRects = [];
    var frame = { width: 0, height: 0, sx: 1, sy: 1, borderScale: 1, blurScale: 1 };
    var position = { x: 0, y: 0 };

    function invalidate() {
        version++;
        Object.keys(entries).forEach(function(key) {
            entries[key].placed = false;
        });
        dirty = true;
        if (renderRafId === null) {
            renderRafId = requestAnimationFrame(function() {
                renderRafId = null;
                render();
            });
        }
    }

    function updateScale() {
        if (canvas === null || script === null) {
            return;
        }

        var sx = canvas.width / script.playResX;
        var sy = canvas.height / script.playResY;
        var blurScale = script.layoutResY > 0 ? canvas.height / script.layoutResY : 1;
        var borderScale = script.scaledBorder ? sy : blurScale;
        if (frame.width !== canvas.width || frame.height !== canvas.height || frame.sx !== sx || frame.sy !== sy || frame.blurScale !== blurScale || frame.borderScale !== borderScale) {
            frame.width = canvas.width;
            frame.height = canvas.height;
            frame.sx = sx;
            frame.sy = sy;
            frame.blurScale = blurScale;
            frame.borderScale = borderScale;
            invalidate();
        }
    }

    function syncLayout() {
        resizeRafId = null;
        if (canvas === null) {
            return;
        }

        var rect = getContentRect(containerElement);
        if (!rect.width || !rect.height) {
            return;
        }

        var key = rect.left + ',' + rect.top + ',' + rect.width + ',' + rect.height + ',' + window.devicePixelRatio;
        if (key === layoutKey) {
            return;
        }

        layoutKey = key;
        var pixelRatio = window.devicePixelRatio || 1;
        var width = Math.max(1, Math.floor(rect.width * pixelRatio));
        var height = Math.max(1, Math.floor(rect.height * pixelRatio));
        if (height > MAX_RENDER_HEIGHT) {
            width = Math.max(1, Math.floor(width * MAX_RENDER_HEIGHT / height));
            height = MAX_RENDER_HEIGHT;
        }
        canvas.style.left = rect.left + 'px';
        canvas.style.top = rect.top + 'px';
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            drawnRects.length = 0;
        }
        updateScale();
    }

    function scheduleLayout() {
        if (resizeRafId === null) {
            resizeRafId = requestAnimationFrame(syncLayout);
        }
    }

    function ensureCanvas() {
        if (canvas !== null) {
            return;
        }

        canvas = document.createElement('canvas');
        canvas.style.position = 'absolute';
        canvas.style.display = 'block';
        canvas.style.zIndex = '2';
        canvas.style.pointerEvents = 'none';
        canvas.style.opacity = String(opacity);
        context = canvas.getContext('2d');
        containerElement.appendChild(canvas);
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(scheduleLayout);
            resizeObserver.observe(containerElement);
            var videoElement = containerElement.querySelector('video');
            if (videoElement instanceof HTMLVideoElement) {
                resizeObserver.observe(videoElement);
            }
        }
        layoutKey = null;
        lastRectCheck = Date.now();
        syncLayout();
    }

    function getPosition(ev, time) {
        if (ev.pos !== null) {
            position.x = ev.pos.x;
            position.y = ev.pos.y;
            return position;
        }
        if (ev.move !== null) {
            var progress = parseEvent.getMoveProgress(ev.move, time);
            position.x = ev.move.x1 + (ev.move.x2 - ev.move.x1) * progress;
            position.y = ev.move.y1 + (ev.move.y2 - ev.move.y1) * progress;
            return position;
        }
        return null;
    }

    function getLimits(ev, current) {
        var limits = [0, 0, frame.width, frame.height];
        if (ev.move !== null) {
            var dx1 = (ev.move.x1 - current.x) * frame.sx;
            var dx2 = (ev.move.x2 - current.x) * frame.sx;
            var dy1 = (ev.move.y1 - current.y) * frame.sy;
            var dy2 = (ev.move.y2 - current.y) * frame.sy;
            limits[0] -= Math.max(0, dx1, dx2);
            limits[1] -= Math.max(0, dy1, dy2);
            limits[2] -= Math.min(0, dx1, dx2);
            limits[3] -= Math.min(0, dy1, dy2);
        } else if (!ev.positioned) {
            limits[1] = -frame.height;
            limits[3] = frame.height * 2;
        } else if (ev.clip !== null && !ev.clip.inverse && ev.vectorClip === null) {
            limits[0] = Math.max(limits[0], Math.min(ev.clip.x1, ev.clip.x2) * frame.sx);
            limits[1] = Math.max(limits[1], Math.min(ev.clip.y1, ev.clip.y2) * frame.sy);
            limits[2] = Math.min(limits[2], Math.max(ev.clip.x1, ev.clip.x2) * frame.sx);
            limits[3] = Math.min(limits[3], Math.max(ev.clip.y1, ev.clip.y2) * frame.sy);
        }
        return limits;
    }

    function prepareEntry(entry, time) {
        var relative = time - entry.event.start;
        var stamp = entry.compiled.dynamic ? parseEvent.getStamp(entry.compiled, relative, TARGET_FPS) : 0;
        if (entry.version === version && entry.stamp === stamp) {
            return false;
        }

        var ev = entry.compiled.dynamic || entry.ev === null ? parseEvent.evaluateEvent(entry.compiled, entry.event, script, time) : entry.ev;
        var current = getPosition(ev, relative);
        var layout = renderEvent.layoutEvent(ev, entry.event, script, frame, fontRegistry, current);
        renderEvent.renderEvent(entry, ev, layout, frame, relative, getLimits(ev, current || position));
        entry.ev = ev;
        entry.layout = layout;
        entry.stamp = stamp;
        entry.version = version;
        entry.renderX = current !== null ? current.x * frame.sx : 0;
        entry.renderY = current !== null ? current.y * frame.sy : 0;
        return true;
    }

    function placeEntries() {
        var pending = false;
        for (var i = 0; i < active.length; i++) {
            if (!active[i].placed) {
                pending = true;
                break;
            }
        }
        if (!pending) {
            return;
        }

        var rects = [];
        active.forEach(function(entry) {
            if (entry.placed && entry.collides) {
                rects.push(getRect(entry));
            }
        });
        active.forEach(function(entry) {
            if (entry.placed) {
                return;
            }
            entry.placed = true;
            entry.shift = 0;
            entry.collides = entry.compiled.collisions && !entry.ev.positioned;
            if (!entry.collides) {
                return;
            }
            var rect = getRect(entry);
            var down = entry.ev.alignment >= 7;
            var moved = true;
            for (var guard = 0; moved && guard < 32; guard++) {
                moved = false;
                for (var j = 0; j < rects.length; j++) {
                    var other = rects[j];
                    if (other.layer === rect.layer && rect.left < other.right && rect.right > other.left && rect.top + entry.shift < other.bottom && rect.bottom + entry.shift > other.top) {
                        entry.shift = down ? other.bottom - rect.top : other.top - rect.bottom;
                        moved = true;
                    }
                }
            }
            entry.shift = Math.round(entry.shift);
            rects.push(getRect(entry));
        });
    }

    function getRect(entry) {
        var layout = entry.layout;
        return {
            layer: entry.event.layer,
            left: layout.left,
            right: layout.left + layout.width,
            top: layout.top + entry.shift,
            bottom: layout.top + layout.height + entry.shift
        };
    }

    function updateActive(time) {
        var events = script.events;
        var low = 0;
        var high = events.length;
        while (low < high) {
            var middle = (low + high) >> 1;
            if (events[middle].start <= time) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }
        validFrom = time;
        validTo = low < events.length ? events[low].start : Infinity;
        var nextEntries = {};
        var nextActive = [];
        for (var i = low - 1; i >= 0 && script.maxEnds[i] > time; i--) {
            var event = events[i];
            if (event.end <= time) {
                continue;
            }
            validTo = Math.min(validTo, event.end);
            var key = getEventKey(event);
            while (nextEntries[key]) {
                key += '#';
            }
            var entry = entries[key] || {
                key: key, compiled: parseEvent.compileEvent(event), ev: null, layout: null, canvas: null, left: 0, top: 0, width: 0, height: 0, renderX: 0, renderY: 0,
                stamp: null, version: -1, placed: false, collides: false, shift: 0, opacity: -1, x: 0, y: 0, clipPath: null, clipRule: null, clipEv: null, clipVersion: -1
            };
            entry.event = event;
            nextEntries[key] = entry;
            nextActive.push(entry);
        }
        active.forEach(function(entry) {
            if (nextEntries[entry.key] !== entry) {
                releaseEntry(entry);
            }
        });
        entries = nextEntries;
        active = nextActive.sort(sortEntries);
        animated = active.some(function(entry) {
            return entry.compiled.animated;
        });
        dirty = true;
    }

    function applyClip(entry) {
        var ev = entry.ev;
        if (ev.vectorClip === null && ev.clip === null) {
            return false;
        }

        if (entry.clipEv !== ev || entry.clipVersion !== version) {
            var path = new Path2D();
            var inverse = ev.vectorClip !== null ? ev.vectorClip.inverse : ev.clip.inverse;
            if (inverse) {
                path.rect(0, 0, frame.width, frame.height);
            }
            if (ev.vectorClip !== null) {
                var unit = 1 / Math.pow(2, ev.vectorClip.scale - 1);
                buildPath(ev.vectorClip.drawing, unit * frame.sx, unit * frame.sy, 0, 0, path);
            } else {
                path.rect(ev.clip.x1 * frame.sx, ev.clip.y1 * frame.sy, (ev.clip.x2 - ev.clip.x1) * frame.sx, (ev.clip.y2 - ev.clip.y1) * frame.sy);
            }
            entry.clipPath = path;
            entry.clipRule = inverse ? 'evenodd' : 'nonzero';
            entry.clipEv = ev;
            entry.clipVersion = version;
        }
        context.save();
        context.clip(entry.clipPath, entry.clipRule);
        return true;
    }

    function compose(time, now) {
        lastComposeAt = now;
        var changed = dirty;
        dirty = false;
        var i;
        var entry;
        for (i = 0; i < active.length; i++) {
            if (prepareEntry(active[i], time)) {
                changed = true;
            }
        }
        placeEntries();
        for (i = 0; i < active.length; i++) {
            entry = active[i];
            var relative = time - entry.event.start;
            var nextOpacity = parseEvent.getFadeOpacity(entry.ev.fade, relative);
            var x = entry.left;
            var y = entry.top + entry.shift;
            var current = getPosition(entry.ev, relative);
            if (current !== null) {
                x += Math.round(current.x * frame.sx - entry.renderX);
                y += Math.round(current.y * frame.sy - entry.renderY);
            }
            if (nextOpacity !== entry.opacity || x !== entry.x || y !== entry.y) {
                entry.opacity = nextOpacity;
                entry.x = x;
                entry.y = y;
                changed = true;
            }
        }
        if (!changed) {
            return;
        }

        for (i = 0; i < drawnRects.length; i += 4) {
            context.clearRect(drawnRects[i] - 1, drawnRects[i + 1] - 1, drawnRects[i + 2] + 2, drawnRects[i + 3] + 2);
        }
        drawnRects.length = 0;
        for (i = 0; i < active.length; i++) {
            entry = active[i];
            if (entry.canvas === null || entry.opacity <= 0) {
                continue;
            }
            context.globalAlpha = entry.opacity;
            var clipped = applyClip(entry);
            context.drawImage(entry.canvas, 0, 0, entry.width, entry.height, entry.x, entry.y, entry.width, entry.height);
            if (clipped) {
                context.restore();
            }
            drawnRects.push(entry.x, entry.y, entry.width, entry.height);
        }
        context.globalAlpha = 1;
    }

    function releaseEntry(entry) {
        if (entry.canvas !== null) {
            entry.canvas.width = 0;
            entry.canvas.height = 0;
            entry.canvas = null;
        }
    }

    function clear() {
        active.forEach(releaseEntry);
        script = null;
        activeTrack = null;
        entries = {};
        active = [];
        animated = false;
        validFrom = Infinity;
        validTo = -Infinity;
        if (context !== null) {
            context.clearRect(0, 0, canvas.width, canvas.height);
        }
        drawnRects.length = 0;
    }

    function fail(error) {
        var failedTrack = activeTrack;
        clear();
        if (typeof options.onError === 'function') {
            options.onError(error, failedTrack);
        }
    }

    function render() {
        if (script === null || context === null || lastTime === null) {
            return;
        }

        var now = Date.now();
        if (now - lastRectCheck > RECT_CHECK_INTERVAL) {
            lastRectCheck = now;
            syncLayout();
        }
        if (!frame.width) {
            return;
        }

        var time = (lastTime - delay) / rate;
        var changed = time < validFrom || time >= validTo;
        if (!changed && !dirty && (!animated || now - lastComposeAt < 1000 / TARGET_FPS)) {
            return;
        }

        try {
            if (changed) {
                updateActive(time);
            }
            compose(time, now);
        } catch (error) {
            fail(error);
        }
    }

    function applyScript(text) {
        script = parseScript(text);
        validFrom = Infinity;
        validTo = -Infinity;
        dirty = true;
        updateScale();
    }

    function load(track, subtitleText) {
        return Promise.resolve().then(function() {
            ensureCanvas();
            activeTrack = track;
            fontRegistry.add(track.fonts);
            applyScript(subtitleText);
            render();
            return track;
        });
    }

    function setTrack(text) {
        if (canvas === null || script === null) {
            return;
        }

        try {
            applyScript(text);
            render();
        } catch (error) {
            fail(error);
        }
    }

    function addFonts(fonts) {
        fontRegistry.add(fonts);
    }

    function destroy() {
        clear();
        if (resizeRafId !== null) {
            cancelAnimationFrame(resizeRafId);
            resizeRafId = null;
        }
        if (renderRafId !== null) {
            cancelAnimationFrame(renderRafId);
            renderRafId = null;
        }
        if (resizeObserver !== null) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
        if (canvas !== null && canvas.parentElement) {
            canvas.parentElement.removeChild(canvas);
        }
        canvas = null;
        context = null;
        frame.width = 0;
        frame.height = 0;
        fontRegistry.clear();
        renderEvent.releaseScratch();
        return Promise.resolve();
    }

    function preload() {}

    function setDelay(value) {
        delay = value !== null && isFinite(value) ? parseInt(value, 10) : 0;
        validTo = -Infinity;
        render();
    }

    function setRate(value) {
        rate = value !== null && isFinite(value) && value > 0 ? parseFloat(value) : 1;
        validTo = -Infinity;
        render();
    }

    function setTime(value) {
        if (value !== null && isFinite(value)) {
            lastTime = Number(value);
            render();
        }
    }

    function setOpacity(value) {
        opacity = typeof value === 'number' && isFinite(value) ? Math.min(Math.max(value, 0), 1) : 1;
        if (canvas !== null) {
            canvas.style.opacity = String(opacity);
        }
    }

    return {
        load: load,
        destroy: destroy,
        preload: preload,
        addFonts: addFonts,
        setDelay: setDelay,
        setRate: setRate,
        setTime: setTime,
        setTrack: setTrack,
        setOpacity: setOpacity
    };
}

module.exports = createCanvasASSRenderer;
