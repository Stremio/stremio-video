// Lightweight charset sniffer for local subtitle files.
//
// Context: subtitles served through addons (OpenSubtitles etc.) arrive as
// already-UTF-8 text via `resp.text()`, because the addon/proxy converts them
// server-side. Local files dropped by the user, however, are read as a raw
// ArrayBuffer and were previously force-decoded with `new TextDecoder()`,
// which always assumes UTF-8. Older .srt files - very common for Turkish,
// Cyrillic (Serbian/Russian/Bulgarian), Greek and Central European languages -
// are typically saved as windows-1250/1251/1252/1253/1254 instead, so forcing
// UTF-8 produces garbled (mojibake) text instead of throwing, since
// single-byte encodings rarely contain invalid byte sequences.
//
// This module tries strict UTF-8 first (fatal: true) and, if that fails,
// scores a handful of common legacy single-byte code pages. The scoring is
// two-stage:
//   1. A structural penalty (replacement chars / C1 control codes), which
//      catches decodes that are structurally broken.
//   2. A language-plausibility score, which counts occurrences of a small
//      set of very common short function words for the language each
//      candidate encoding is normally used for (e.g. "için", "değil" for
//      Turkish; "и", "что" for Russian; "και", "είναι" for Greek).
//
// The language-plausibility score is the primary signal: structural checks
// alone can't tell apart candidates, because most single-byte code pages map
// every byte to *some* printable character, so a wrong decode still "looks"
// clean structurally - it just isn't real text in that language. Two
// mismatched Latin-family code pages (e.g. real Turkish text decoded as
// windows-1252) will look structurally fine, but this misdecode will not
// contain recognizable Turkish function words, exposing the mismatch.

var CANDIDATE_ENCODINGS = [
    'windows-1254', // Turkish
    'windows-1252', // Western European
    'windows-1251', // Cyrillic (Russian, Bulgarian, Serbian Cyrillic, ...)
    'windows-1253', // Greek
    'windows-1250', // Central/Eastern European (Polish, Czech, Croatian, ...)
    'iso-8859-9', // Turkish (ISO variant)
    'iso-8859-1', // Western European (ISO variant)
];

// A handful of very common, short, case-insensitive function words per
// encoding's typical language. These are deliberately picked to include
// language-specific accented letters where possible, since ASCII-only words
// decode identically under every candidate and can't discriminate between
// them.
var COMMON_WORDS = {
    'windows-1254': ['için', 'değil', 'çok', 'gibi', 'ama', 'evet', 'hayır', 'şey', 'bir', 've'],
    'iso-8859-9': ['için', 'değil', 'çok', 'gibi', 'ama', 'evet', 'hayır', 'şey', 'bir', 've'],
    'windows-1252': ['the', 'and', 'que', 'est', 'être', 'être', 'für', 'nicht', 'être', 'ist'],
    'iso-8859-1': ['the', 'and', 'que', 'est', 'être', 'für', 'nicht', 'ist'],
    'windows-1251': ['что', 'это', 'как', 'не', 'вы', 'она', 'они', 'да', 'нет', 'был'],
    'windows-1253': ['και', 'της', 'είναι', 'δεν', 'μια', 'ένα', 'εγώ', 'εσύ', 'τι'],
    'windows-1250': ['nie', 'się', 'jest', 'czy', 'ale', 'bardzo', 'byłо', 'není', 'jsem'],
};

function countWordMatches(text, words) {
    var lower = text.toLowerCase();
    var count = 0;
    for (var i = 0; i < words.length; i++) {
        var word = words[i];
        var idx = 0;
        while (true) {
            idx = lower.indexOf(word, idx);
            if (idx === -1) {
                break;
            }
            count += 1;
            idx += word.length;
        }
    }
    return count;
}

function hasBOM(bytes) {
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        return 'utf-8';
    }
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
        return 'utf-16le';
    }
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
        return 'utf-16be';
    }
    return null;
}

function structuralPenalty(text) {
    var count = 0;
    for (var i = 0; i < text.length; i++) {
        var code = text.charCodeAt(i);
        if (code === 0xFFFD || (code >= 0x80 && code <= 0x9F)) {
            count += 1;
        }
    }
    return count;
}

function tryDecode(bytes, encoding, fatal) {
    try {
        return new TextDecoder(encoding, { fatal: !!fatal }).decode(bytes);
    } catch (_error) {
        return null;
    }
}

function decode(bytes) {
    var bom = hasBOM(bytes);
    if (bom) {
        return tryDecode(bytes, bom, false);
    }

    var strictUtf8 = tryDecode(bytes, 'utf-8', true);
    if (strictUtf8 !== null) {
        return strictUtf8;
    }

    var best = null;
    var bestWordScore = -1;
    var bestPenalty = Infinity;

    for (var i = 0; i < CANDIDATE_ENCODINGS.length; i++) {
        var encoding = CANDIDATE_ENCODINGS[i];
        var candidate = tryDecode(bytes, encoding, false);
        if (candidate === null) {
            continue;
        }

        var penalty = structuralPenalty(candidate);
        var wordScore = countWordMatches(candidate, COMMON_WORDS[encoding] || []);

        // Primary signal: which candidate contains more recognizable words
        // for its own language. Structural penalty is used as a tie-breaker
        // and as a sanity filter.
        if (wordScore > bestWordScore ||
            (wordScore === bestWordScore && penalty < bestPenalty)) {
            bestWordScore = wordScore;
            bestPenalty = penalty;
            best = candidate;
        }
    }

    if (best !== null) {
        return best;
    }

    return tryDecode(bytes, 'utf-8', false);
}

module.exports = {
    decode: decode,
};
