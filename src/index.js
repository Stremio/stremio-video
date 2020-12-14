var HTMLVideo = require('./HTMLVideo');
var YouTubeVideo = require('./YouTubeVideo');
var ChromecastVideo = require('./ChromecastVideo');
var ChromecastReceiverVideo = require('./ChromecastReceiverVideo');
var withHTMLSubtitles = require('./withHTMLSubtitles');
var withStreamingServer = require('./withStreamingServer');

module.exports = {
    HTMLVideo: HTMLVideo,
    YouTubeVideo: YouTubeVideo,
    ChromecastVideo: ChromecastVideo,
    ChromecastReceiverVideo: ChromecastReceiverVideo,
    withHTMLSubtitles: withHTMLSubtitles,
    withStreamingServer: withStreamingServer
};
