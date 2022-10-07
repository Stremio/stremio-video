var ChromecastSenderVideo = require('../ChromecastSenderVideo');
var ShellVideo = require('../ShellVideo');
var HTMLVideo = require('../HTMLVideo');
var TizenVideo = require('../TizenVideo');
var IFrameVideo = require('../IFrameVideo');
var YouTubeVideo = require('../YouTubeVideo');
var withStreamingServer = require('../withStreamingServer');
var withHTMLSubtitles = require('../withHTMLSubtitles');

function selectVideoImplementation(commandArgs, options) {
    if (!commandArgs.stream || typeof commandArgs.stream.externalUrl === 'string') {
        return null;
    }

    if (options.chromecastTransport && options.chromecastTransport.getCastState() === cast.framework.CastState.CONNECTED) {
        return ChromecastSenderVideo;
    }

    if (typeof commandArgs.stream.ytId === 'string') {
        return withHTMLSubtitles(YouTubeVideo);
    }

    if (typeof commandArgs.stream.playerFrameUrl === 'string') {
        return IFrameVideo;
    }

    if (options.shellTransport) {
        return withStreamingServer(withHTMLSubtitles(ShellVideo));
    }

    if (typeof commandArgs.streamingServerURL === 'string') {
        if (typeof global.tizen !== 'undefined') {
            return withStreamingServer(withHTMLSubtitles(TizenVideo));
        }
        return withStreamingServer(withHTMLSubtitles(HTMLVideo));
    }

    if (typeof commandArgs.stream.url === 'string') {
        if (typeof global.tizen !== 'undefined') {
            return withHTMLSubtitles(TizenVideo);
        }
        return withHTMLSubtitles(HTMLVideo);
    }

    return null;
}

module.exports = selectVideoImplementation;
