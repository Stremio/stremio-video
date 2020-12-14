var StremioVideo = require('./StremioVideo');
var HTMLVideo = require('./HTMLVideo');
var YouTubeVideo = require('./YouTubeVideo');
var ChromecastSenderVideo = require('./ChromecastSenderVideo');
var withHTMLSubtitles = require('./withHTMLSubtitles');
var withStreamingServer = require('./withStreamingServer');

module.exports = {
    StremioVideo: StremioVideo,
    HTMLVideo: HTMLVideo,
    YouTubeVideo: YouTubeVideo,
    ChromecastSenderVideo: ChromecastSenderVideo,
    withHTMLSubtitles: withHTMLSubtitles,
    withStreamingServer: withStreamingServer
};
