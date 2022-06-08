var ChromecastSenderVideo = require('../ChromecastSenderVideo');
var HTMLVideo = require('../HTMLVideo');
var TizenVideo = require('../TizenVideo');
var WebOsVideo = require('../WebOsVideo');
var IFrameVideo = require('../IFrameVideo');
var YouTubeVideo = require('../YouTubeVideo');
var withStreamingServer = require('../withStreamingServer');
var withHTMLSubtitles = require('../withHTMLSubtitles');

function selectVideoImplementation(commandArgs, options) {
    console.log('vid impl 1');
    if (!commandArgs.stream || typeof commandArgs.stream.externalUrl === 'string') {
        return null;
    }

    console.log('vid impl 2');
    if (options.chromecastTransport && options.chromecastTransport.getCastState() === cast.framework.CastState.CONNECTED) {
        return ChromecastSenderVideo;
    }

    console.log('vid impl 3');
    if (typeof commandArgs.stream.ytId === 'string') {
        return withHTMLSubtitles(YouTubeVideo);
    }

    console.log('vid impl 4');
    if (typeof commandArgs.stream.playerFrameUrl === 'string') {
        return IFrameVideo;
    }

    console.log('streaming server url: ' + commandArgs.streamingServerURL);

    console.log('type of ')

    if (typeof commandArgs.streamingServerURL === 'string') {
    console.log('vid impl 5');
        if (typeof global.webOS !== 'undefined') {
    console.log('vid impl 6');
            return withStreamingServer(withHTMLSubtitles(WebOsVideo));
        }

    console.log('vid impl 7');
        if (typeof global.tizen !== 'undefined') {
    console.log('vid impl 8');
            return withStreamingServer(withHTMLSubtitles(TizenVideo));
        }

    console.log('vid impl 9');
        return withStreamingServer(withHTMLSubtitles(HTMLVideo));
    }

    console.log('vid impl 10');
    if (typeof commandArgs.stream.url === 'string') {
    console.log('vid impl 11');
        if (typeof global.webOS !== 'undefined') {
    console.log('vid impl 12');
            return withHTMLSubtitles(WebOsVideo);
        }

    console.log('vid impl 13');
        if (typeof global.tizen !== 'undefined') {
    console.log('vid impl 14');
            return withHTMLSubtitles(TizenVideo);
        }

    console.log('vid impl 15');
        return withHTMLSubtitles(HTMLVideo);
    }

    console.log('vid impl 16');
    return null;
}

module.exports = selectVideoImplementation;
