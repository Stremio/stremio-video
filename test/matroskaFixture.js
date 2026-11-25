function uint(value) {
    var bytes = Buffer.alloc(4);
    bytes.writeUInt32BE(value);
    return bytes;
}

function element(id, ...parts) {
    var data = Buffer.concat(parts.map(function(part) { return Buffer.from(part); }));
    return Buffer.concat([Buffer.from(id, 'hex'), uint(0x10000000 + data.length), data]);
}

function cue(time, track, clusterOffset, relativeOffset, duration) {
    var position = [element('f7', uint(track)), element('f1', uint(clusterOffset))];
    if (relativeOffset !== undefined) position.push(element('f0', uint(relativeOffset)), element('b2', uint(duration)));
    return element('bb', element('b3', uint(time)), element('b7', ...position));
}

function caption(start, duration, order, text) {
    var header = Buffer.from([0x83, start >> 8, start & 0xff, 0]);
    return element('a0', element('a1', header, order + ',0,Default,,0,0,0,,' + text), element('9b', uint(duration)));
}

function createFixture({ padding = 6200, indexSubtitles = true, secondSubtitleStart = 5000, duplicateClusterCue = false } = {}) {
    var tracks = element('1654ae6b',
        element('ae', element('d7', uint(2)), element('83', uint(17)), element('86', 'S_TEXT/UTF8')),
        element('ae', element('d7', uint(3)), element('83', uint(17)), element('86', 'S_TEXT/ASS'),
            element('63a2', '[Script Info]\nScriptType: v4.00+\n'), element('22b59c', 'por')));
    var timestamp = element('e7', uint(0));
    var first = caption(1000, 3000, 0, 'First subtitle');
    var second = caption(secondSubtitleStart, 2000, 1, 'Second subtitle');
    var firstCluster = element('1f43b675', timestamp, first, second);
    var voidElement = element('ec', Buffer.alloc(padding));
    var nextCluster = element('1f43b675', element('e7', uint(40000)));

    function seekHead(trackOffset, cueOffset) {
        return element('114d9b74',
            element('4dbb', element('53ab', Buffer.from('1654ae6b', 'hex')), element('53ac', uint(trackOffset))),
            element('4dbb', element('53ab', Buffer.from('1c53bb6b', 'hex')), element('53ac', uint(cueOffset))));
    }

    function cues(firstOffset, nextOffset) {
        var entries = [cue(0, 1, firstOffset)];
        if (indexSubtitles) {
            entries.push(cue(1000, 3, firstOffset, timestamp.length, 3000));
            entries.push(cue(secondSubtitleStart, 3, firstOffset, timestamp.length + first.length, 2000));
        }
        if (duplicateClusterCue) entries.push(cue(10000, 1, firstOffset));
        entries.push(cue(40000, 1, nextOffset));
        return element('1c53bb6b', ...entries);
    }

    var trackOffset = seekHead(0, 0).length;
    var cueOffset = trackOffset + tracks.length;
    var firstOffset = cueOffset + cues(0, 0).length;
    var nextOffset = firstOffset + firstCluster.length + voidElement.length;
    return Buffer.concat([
        element('1a45dfa3', element('4282', 'matroska')),
        element('18538067', seekHead(trackOffset, cueOffset), tracks, cues(firstOffset, nextOffset),
            firstCluster, voidElement, nextCluster)
    ]);
}

module.exports = createFixture;
