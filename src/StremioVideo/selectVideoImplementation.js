var ChromecastSenderVideo = require('../ChromecastSenderVideo');
var HTMLVideo = require('../HTMLVideo');
var IFrameVideo = require('../IFrameVideo');
var YouTubeVideo = require('../YouTubeVideo');
var withStreamingServer = require('../withStreamingServer');
var withHTMLSubtitles = require('../withHTMLSubtitles');

function selectVideoImplementation(args) {
    if (!args.stream || typeof args.stream.externalUrl === 'string') {
        return null;
    }

    if (args.chromecastTransport && args.chromecastTransport.getCastState() === cast.framework.CastState.CONNECTED) {
        return ChromecastSenderVideo;
    }

    if (typeof args.stream.ytId === 'string') {
        return withHTMLSubtitles(YouTubeVideo);
    }

    if (typeof args.stream.playerFrameUrl === 'string') {
        return IFrameVideo;
    }

    if (typeof args.streamingServerURL === 'string') {
        return withStreamingServer(withHTMLSubtitles(HTMLVideo));
    }

    if (typeof args.stream.url === 'string') {
        return withHTMLSubtitles(HTMLVideo);
    }

    return null;
}

module.exports = selectVideoImplementation;
