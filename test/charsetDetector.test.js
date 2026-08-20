var assert = require('assert');
var charsetDetector = require('../src/withHTMLSubtitles/charsetDetector');

function concatBytes(ascii, legacyBytes) {
    return Uint8Array.from(Array.prototype.slice.call(Buffer.from(ascii, 'ascii')).concat(legacyBytes));
}

function test(name, fn) {
    fn();
    process.stdout.write('ok - ' + name + '\n');
}

test('keeps valid UTF-8 text unchanged', function() {
    var input = Uint8Array.from(Buffer.from('Türkçe, Ελληνικά, Русский', 'utf8'));

    assert.strictEqual(charsetDetector.decode(input), 'Türkçe, Ελληνικά, Русский');
});

test('does not count a common word inside a longer token', function() {
    // windows-1251 bytes for "theatre theatre что". Substring matching used
    // to count "the" twice for windows-1252 and select the wrong candidate.
    var input = concatBytes('theatre theatre ', [0xF7, 0xF2, 0xEE]);

    assert.strictEqual(charsetDetector.decode(input), 'theatre theatre что');
});

test('prioritizes structural validity over a higher language score', function() {
    // windows-1251 bytes for "the the Ѓ не". windows-1252 recognizes two
    // English tokens but maps 0x81 to a replacement character; windows-1251
    // is structurally clean and must win even with the lower word score.
    var input = concatBytes('the the ', [0x81, 0x20, 0xED, 0xE5]);

    assert.strictEqual(charsetDetector.decode(input), 'the the Ѓ не');
});

test('recognizes the corrected windows-1250 common word', function() {
    // windows-1250 bytes for "było". The old table ended the word with a
    // Cyrillic "о", so it never matched the correctly decoded Polish token.
    var input = Uint8Array.from([0x62, 0x79, 0xB3, 0x6F]);

    assert.strictEqual(charsetDetector.decode(input), 'było');
});
