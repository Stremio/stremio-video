var VTTJS = require('vtt.js');

function render(cuesByTime, timeIndex) {
    var nodes = [];
    if (timeIndex !== -1) {
        var cuesForTime = cuesByTime[cuesByTime.times[timeIndex]];
        for (var i = 0; i < cuesForTime.length; i++) {
            var node = VTTJS.WebVTT.convertCueToDOMTree(window, cuesForTime[i].text);
            nodes.push(node);
        }
    }

    return nodes;
}

module.exports = {
    render: render
};
