var ASS_EXTENSION_PATTERN = /\.(ass|ssa)(?:$|[?#])/i;
var ASS_FORMATS = {
    ass: true,
    ssa: true
};
var ASS_MIME_TYPES = {
    'application/ass': true,
    'application/ssa': true,
    'application/x-ass': true,
    'application/x-ssa': true,
    'text/ass': true,
    'text/ssa': true,
    'text/x-ass': true,
    'text/x-ssa': true
};

function normalizeType(value) {
    if (typeof value !== 'string') {
        return null;
    }

    return value.split(';')[0].trim().toLowerCase();
}

function hasASSExtension(value) {
    return typeof value === 'string' && ASS_EXTENSION_PATTERN.test(value);
}

function isASSFormat(value) {
    var normalized = normalizeType(value);

    return normalized !== null && (
        ASS_FORMATS[normalized] === true ||
        ASS_MIME_TYPES[normalized] === true ||
        /(?:^|\/|\.)(ass|ssa)$/i.test(normalized)
    );
}

function isASSSubtitleTrack(track) {
    if (!track || typeof track !== 'object') {
        return false;
    }

    return [
        track.type,
        track.mimeType,
        track.contentType,
        track.subtitlesType,
        track.format,
        track.codec
    ].some(isASSFormat) || [
        track.url,
        track.fallbackUrl,
        track.filename,
        track.fileName
    ].some(hasASSExtension);
}

function isASSContent(text) {
    return typeof text === 'string' &&
        /^\s*\[(?:Script Info|V4\+? Styles|Events)\]/im.test(text) &&
        /^\s*(?:Format|Dialogue)\s*:/im.test(text);
}

function isASSSubtitle(track, text) {
    return isASSSubtitleTrack(track) || isASSContent(text);
}

module.exports = {
    hasASSExtension: hasASSExtension,
    isASSContent: isASSContent,
    isASSSubtitle: isASSSubtitle,
    isASSSubtitleTrack: isASSSubtitleTrack
};
