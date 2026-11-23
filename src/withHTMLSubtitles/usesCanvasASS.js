var platform = require('../platform');

var CANVAS_ASS_PLATFORMS = ['Tizen', 'webOS', 'Titan', 'NetTV', 'Vidaa'];

function usesCanvasASS() {
    return CANVAS_ASS_PLATFORMS.includes(platform.get());
}

module.exports = usesCanvasASS;
