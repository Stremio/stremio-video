var HTMLVideo = require('./HTMLVideo');
var YouTubeVideo = require('./YouTubeVideo');
var ChromecastSenderVideo = require('./ChromecastSenderVideo');
var ChromecastReceiverVideo = require('./ChromecastReceiverVideo');
var withHTMLSubtitles = require('./withHTMLSubtitles');
var withStreamingServer = require('./withStreamingServer');

module.exports = {
    HTMLVideo: HTMLVideo,
    YouTubeVideo: YouTubeVideo,
    ChromecastSenderVideo: ChromecastSenderVideo,
    ChromecastReceiverVideo: ChromecastReceiverVideo,
    withHTMLSubtitles: withHTMLSubtitles,
    withStreamingServer: withStreamingServer
};
