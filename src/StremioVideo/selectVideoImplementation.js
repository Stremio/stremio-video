var ChromecastSenderVideo = require('../ChromecastSenderVideo');
var ShellVideo = require('../ShellVideo');
var HTMLVideo = require('../HTMLVideo');
var TizenVideo = require('../TizenVideo');
var WebOsVideo = require('../WebOsVideo');
var IFrameVideo = require('../IFrameVideo');
var YouTubeVideo = require('../YouTubeVideo');
var withStreamingServer = require('../withStreamingServer');
var withHTMLSubtitles = require('../withHTMLSubtitles');
var withVideoParams = require('../withVideoParams');

function selectVideoImplementation(commandArgs, options) {
    if (!commandArgs.stream || typeof commandArgs.stream.externalUrl === 'string') {
        return null;
    }

    if (options.chromecastTransport && options.chromecastTransport.getCastState() === cast.framework.CastState.CONNECTED) {
        return ChromecastSenderVideo;
    }

    if (typeof commandArgs.stream.ytId === 'string') {
        return withVideoParams(withHTMLSubtitles(YouTubeVideo));
    }

    if (typeof commandArgs.stream.playerFrameUrl === 'string') {
        return withVideoParams(IFrameVideo);
    }

    if (options.shellTransport) {
        return withStreamingServer(withHTMLSubtitles(ShellVideo));
    }

    if (typeof commandArgs.streamingServerURL === 'string') {
        if (typeof global.tizen !== 'undefined') {
            return withStreamingServer(withHTMLSubtitles(TizenVideo));
        }
        if (typeof global.webOS !== 'undefined') {
            return withStreamingServer(withHTMLSubtitles(WebOsVideo));
        }
        return withStreamingServer(withHTMLSubtitles(HTMLVideo));
    }

    if (typeof commandArgs.stream.url === 'string') {
        if (typeof global.webOS !== 'undefined') {
            return withVideoParams(withHTMLSubtitles(WebOsVideo));
        }
        if (typeof global.tizen !== 'undefined') {
            return withVideoParams(withHTMLSubtitles(TizenVideo));
        }
        return withVideoParams(withHTMLSubtitles(HTMLVideo));
    }

    return null;
}

module.exports = selectVideoImplementation;
