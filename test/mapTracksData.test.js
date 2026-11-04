var assert = require('node:assert/strict');
var test = require('node:test');
var map = require('../src/TizenVideo/mapTracksData');
function native(index, type, codec) {
    return { index: index, type: type, extra_info: JSON.stringify({ fourCC: codec }) };
}
function source(id, codec, lang, label) { return { id: id, codec: codec, lang: lang, label: label }; }

test('maps all playable audio languages after omitted TrueHD/DTS tracks shift IDs', function() {
    var raw = [native(0, 'VIDEO', 'h265')];
    for (var i = 1; i <= 7; i++) raw.push(native(i, 'AUDIO', 'ac3'));
    var metadata = [source(2, 'TRUEHD', 'en'), source(3, 'DTS', 'en'),
        source(4, 'AC3', 'en', '5.1'), source(5, 'AC3', 'en', '5.1'), source(6, 'AC3', 'en', '2.0'),
        source(7, 'AC3', 'fre'), source(8, 'AC3', 'spa'), source(9, 'AC3', 'por'), source(10, 'AC3', 'en')];
    var result = map(raw, metadata, 'AUDIO');
    assert.deepEqual(Object.values(result).map(function(track) { return track.id; }), [4, 5, 6, 7, 8, 9, 10]);
    assert.equal(result[4].lang, 'fre');
    assert.equal(result[5].lang, 'spa');
    assert.equal(result[6].lang, 'por');
    assert.equal(result[3].label, '2.0');
});
test('maps remaining text subtitles without assigning a missing PGS track to them', function() {
    var raw = [native(8, 'TEXT', 'un  '), native(9, 'TEXT', 'un  ')];
    var result = map(raw, [source(11, 'TEXT/UTF8', 'en'), source(12, 'TEXT/UTF8', 'en', 'SDH'),
        source(13, 'HDMV/PGS', 'en'), source(14, 'HDMV/PGS', 'spa')], 'TEXT');
    assert.equal(result[8].id, 11); assert.equal(result[9].label, 'SDH');
});
test('keeps source order within each type even when native entries are interleaved', function() {
    var result = map([native(6, 'AUDIO', 'aac'), native(0, 'VIDEO', 'h264'), native(2, 'AUDIO', 'aac')],
        [source(9, 'AAC', 'spa'), source(4, 'AAC', 'en')], 'AUDIO');
    assert.equal(result[2].lang, 'en'); assert.equal(result[6].lang, 'spa');
});
test('does not relabel a partial or ambiguous track list', function() {
    assert.deepEqual(map([native(1, 'AUDIO', 'ac3')], [source(2, 'AC3', 'en'), source(3, 'AC3', 'spa')], 'AUDIO'), {});
    assert.deepEqual(map([native(1, 'AUDIO', 'unknown')], [source(2, 'DTS', 'en'), source(3, 'AC3', 'spa')], 'AUDIO'), {});
});
test('does not pair a mismatched codec sequence merely because counts match', function() {
    assert.deepEqual(map([native(1, 'AUDIO', 'ac3'), native(2, 'AUDIO', 'aac')],
        [source(2, 'AAC', 'en'), source(3, 'AC3', 'spa')], 'AUDIO'), {});
});
test('supports Samsung MPEG codec aliases when filtering unsupported audio', function() {
    var result = map([native(1, 'AUDIO', 'mpeg')], [source(2, 'TRUEHD', 'en'), source(3, 'AAC', 'spa')], 'AUDIO');
    assert.equal(result[1].lang, 'spa');
});
test('does not remove bitmap metadata when the native player actually exposes it', function() {
    assert.equal(map([native(0, 'TEXT', 'pgs')], [source(4, 'HDMV/PGS', 'spa')], 'TEXT')[0].lang, 'spa');
});

test('does not assume bitmap tracks are omitted when native codec information says otherwise', function() {
    assert.deepEqual(map([native(0, 'TEXT', 'pgs')], [source(3, 'HDMV/PGS', 'spa'), source(4, 'TEXT/UTF8', 'en')], 'TEXT'), {});
});
