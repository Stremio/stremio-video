var DEFAULT_METRICS = { heightRatio: 1.15, ascentRatio: 0.8 };
var FALLBACK_FAMILIES = 'Arial, Helvetica, sans-serif';

var aliasCount = 0;

function readFontInfo(buffer) {
    var view = new DataView(buffer);
    var offset = view.getUint32(0) === 0x74746366 ? view.getUint32(12) : 0;
    var tables = {};
    var numTables = view.getUint16(offset + 4);
    for (var i = 0; i < numTables; i++) {
        var record = offset + 12 + i * 16;
        var tag = String.fromCharCode(view.getUint8(record), view.getUint8(record + 1), view.getUint8(record + 2), view.getUint8(record + 3));
        tables[tag] = { offset: view.getUint32(record + 8), length: view.getUint32(record + 12) };
    }
    var names = {};
    var preferred = {};
    if (tables.name) {
        var count = view.getUint16(tables.name.offset + 2);
        var strings = tables.name.offset + view.getUint16(tables.name.offset + 4);
        for (i = 0; i < count; i++) {
            var entry = tables.name.offset + 6 + i * 12;
            var platform = view.getUint16(entry);
            var language = view.getUint16(entry + 4);
            var nameId = view.getUint16(entry + 6);
            var length = view.getUint16(entry + 8);
            var start = strings + view.getUint16(entry + 10);
            if ([1, 2, 4, 6, 16, 17].indexOf(nameId) === -1 || start + length > buffer.byteLength || preferred[nameId]) {
                continue;
            }
            var text = '';
            if (platform === 3 || platform === 0) {
                for (var j = 0; j + 1 < length; j += 2) text += String.fromCharCode(view.getUint16(start + j));
            } else if (platform === 1) {
                for (j = 0; j < length; j++) text += String.fromCharCode(view.getUint8(start + j));
            }
            if (text) {
                names[nameId] = text;
                preferred[nameId] = platform === 3 && language === 0x409;
            }
        }
    }
    var os2 = tables['OS/2'];
    var head = tables.head;
    var hhea = tables.hhea;
    var unitsPerEm = head ? view.getUint16(head.offset + 18) : 1000;
    var weight = os2 ? view.getUint16(os2.offset + 4) : 400;
    var italic = os2 ? (view.getUint16(os2.offset + 62) & 1) === 1 : head ? (view.getUint16(head.offset + 44) & 2) === 2 : false;
    var ascent = os2 && os2.length >= 78 ? view.getUint16(os2.offset + 74) : 0;
    var descent = os2 && os2.length >= 78 ? view.getUint16(os2.offset + 76) : 0;
    if (!(ascent + descent) && hhea) {
        ascent = view.getInt16(hhea.offset + 4);
        descent = -view.getInt16(hhea.offset + 6);
    }
    var subfamily = names[17] || names[2] || '';
    weight = weight >= 100 && weight <= 900 ? Math.round(weight / 100) * 100 : /bold/i.test(subfamily) ? 700 : 400;
    return {
        family: names[16] || names[1] || null,
        families: [names[1], names[16]],
        faces: [names[4], names[6]],
        weight: weight,
        italic: italic || /italic|oblique/i.test(subfamily),
        heightRatio: (ascent + descent) / unitsPerEm || DEFAULT_METRICS.heightRatio,
        ascentRatio: ascent / (ascent + descent) || DEFAULT_METRICS.ascentRatio
    };
}

function createFontRegistry(onChange) {
    var loaded = {};
    var families = {};
    var names = {};
    var metrics = {};

    function register(info, alias) {
        var family = info.family.toLowerCase();
        info.families.concat(info.faces).forEach(function(name, index) {
            var key = name ? name.replace(/^@/, '').toLowerCase() : '';
            if (key && !names[key]) {
                names[key] = index < info.families.length && key === family ?
                    { family: alias } :
                    { family: alias, weight: info.weight, italic: info.italic };
            }
        });
        if (!metrics[alias]) {
            metrics[alias] = { heightRatio: info.heightRatio, ascentRatio: info.ascentRatio };
        }
    }

    function load(url) {
        var entry = { face: null };
        loaded[url] = entry;
        fetch(url)
            .then(function(response) {
                if (!response.ok) {
                    throw new Error(response.status + ' (' + response.statusText + ')');
                }

                return response.arrayBuffer();
            })
            .then(function(buffer) {
                if (loaded[url] !== entry) {
                    return;
                }

                var info = readFontInfo(buffer);
                if (info.family === null) {
                    throw new Error('Font family missing');
                }

                var family = info.family.toLowerCase();
                var alias = families[family] || (families[family] = 'stremio-ass-' + (++aliasCount));
                entry.face = new FontFace(alias, buffer, { weight: String(info.weight), style: info.italic ? 'italic' : 'normal' });
                document.fonts.add(entry.face);
                return entry.face.load().then(function() {
                    if (loaded[url] === entry) {
                        register(info, alias);
                        onChange();
                    }
                });
            })
            .catch(function(error) {
                if (entry.face !== null) {
                    document.fonts.delete(entry.face);
                    entry.face = null;
                }
                console.warn('canvasASSRenderer', url, error);
            });
    }

    function add(urls) {
        if (typeof FontFace !== 'function' || !document.fonts || !Array.isArray(urls)) {
            return;
        }

        urls.forEach(function(url) {
            if (typeof url === 'string' && !loaded[url]) {
                load(url);
            }
        });
    }

    function clear() {
        Object.keys(loaded).forEach(function(url) {
            if (loaded[url].face !== null) {
                document.fonts.delete(loaded[url].face);
            }
        });
        loaded = {};
        families = {};
        names = {};
        metrics = {};
    }

    function getFont(state, size) {
        var name = String(state.fontName || '').replace(/^@/, '');
        var match = names[name.toLowerCase()];
        var family = match ? match.family : name.replace(/["\\]/g, '');
        var weight = match && match.weight ? (state.weight > 400 ? Math.max(match.weight, state.weight) : match.weight) : state.weight;
        var italic = match && match.italic ? true : state.italic;
        var fontMetrics = match ? metrics[match.family] : DEFAULT_METRICS;
        var px = size / fontMetrics.heightRatio;
        return {
            css: (italic ? 'italic ' : '') + weight + ' ' + px.toFixed(2) + 'px "' + family + '", ' + FALLBACK_FAMILIES,
            ascentRatio: fontMetrics.ascentRatio
        };
    }

    return {
        add: add,
        clear: clear,
        getFont: getFont
    };
}

module.exports = createFontRegistry;
