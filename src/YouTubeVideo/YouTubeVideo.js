var EventEmitter = require('events');

var API_LOAD_FAILED = 95;

function YouTubeVideo(options) {
    options = options || {};
    var propChangedTimeout = !isNaN(options.propChangedTimeout) ? parseInt(options.propChangedTimeout) : 100;
    var containerElement = options.containerElement;
    if (!(containerElement instanceof HTMLElement)) {
        throw new Error('Container element required to be instance of HTMLElement');
    }

    var apiScriptElement = document.createElement('script');
    apiScriptElement.type = 'text/javascript';
    apiScriptElement.src = 'https://www.youtube.com/iframe_api';
    apiScriptElement.onload = onAPILoaded;
    apiScriptElement.onerror = onAPIError;
    containerElement.appendChild(apiScriptElement);

    var videoContainerElement = document.createElement('div');
    videoContainerElement.style.width = '100%';
    videoContainerElement.style.height = '100%';
    videoContainerElement.style.backgroundColor = 'black';
    containerElement.appendChild(videoContainerElement);

    var events = new EventEmitter();
    events.on('error', function() { });

    var self = this;
    var destroyed = false;
    var ready = false;
    var loaded = false;
    var video = null;
    var actionsQueue = [];
    var observedProps = {
        paused: false,
        time: false,
        duration: false,
        buffering: false,
        volume: false,
        muted: false
    };

    var propChangedIntervalId = window.setInterval(function() {
        onPropChanged('time');
        onPropChanged('duration');
        onPropChanged('volume');
        onPropChanged('muted');
    }, propChangedTimeout);

    function onAPIError() {
        onError({
            code: API_LOAD_FAILED,
            message: 'YouTube player iframe API failed to load',
            critical: true
        });
    }
    function onAPILoaded() {
        if (destroyed) {
            return;
        }

        if (!YT) {
            onAPIError();
            return;
        }

        YT.ready(function() {
            if (destroyed) {
                return;
            }

            video = new YT.Player(videoContainerElement, {
                width: '100%',
                height: '100%',
                playerVars: {
                    autoplay: 1,
                    cc_load_policy: 3,
                    controls: 0,
                    disablekb: 1,
                    enablejsapi: 1,
                    fs: 0,
                    iv_load_policy: 3,
                    loop: 0,
                    modestbranding: 1,
                    playsinline: 1,
                    rel: 0
                },
                events: {
                    onError: onVideoError,
                    onReady: onVideoReady,
                    onStateChange: onVideoStateChange,
                    onApiChange: onVideoAPIChange
                }
            });
        });
    }
    function onVideoError(error) {
        var code = error.data;
        var message;
        switch (error.data) {
            case 2: {
                message = 'Invalid request';
                break;
            }
            case 5: {
                message = 'The requested content cannot be played';
                break;
            }
            case 100: {
                message = 'The video has been removed or marked as private';
                break;
            }
            case 101:
            case 150: {
                message = 'The video cannot be played in embedded players';
                break;
            }
            default: {
                code = 96;
                message = 'Unknown video error';
            }
        }
        onError({
            code: code,
            message: message,
            critical: true,
            error: error
        });
    }
    function onVideoReady() {
        ready = true;
        onPropChanged('volume');
        onPropChanged('muted');
        flushActionsQueue();
    }
    function onVideoStateChange(state) {
        onPropChanged('buffering');
        switch (state.data) {
            case YT.PlayerState.ENDED: {
                onEnded();
                break;
            }
            case YT.PlayerState.PAUSED:
            case YT.PlayerState.PLAYING: {
                onPropChanged('paused');
                onPropChanged('time');
                onPropChanged('duration');
                break;
            }
            case YT.PlayerState.UNSTARTED: {
                onPropChanged('paused');
                break;
            }
        }
    }
    function onVideoAPIChange() {
        // video.loadModule('captions');
    }
    function flushActionsQueue() {
        while (actionsQueue.length > 0) {
            var action = actionsQueue.shift();
            self.dispatch.call(self, action);
        }
    }
    function getProp(propName) {
        switch (propName) {
            case 'paused': {
                if (!loaded) {
                    return null;
                }

                return video.getPlayerState() !== YT.PlayerState.PLAYING;
            }
            case 'time': {
                if (!loaded || video.getCurrentTime() === null || !isFinite(video.getCurrentTime())) {
                    return null;
                }

                return Math.floor(video.getCurrentTime() * 1000);
            }
            case 'duration': {
                if (!loaded || video.getDuration() === null || !isFinite(video.getDuration())) {
                    return null;
                }

                return Math.floor(video.getDuration() * 1000);
            }
            case 'buffering': {
                if (!loaded) {
                    return null;
                }

                return video.getPlayerState() === YT.PlayerState.BUFFERING;
            }
            case 'volume': {
                if (!ready || destroyed || video.getVolume() === null || !isFinite(video.getVolume())) {
                    return null;
                }

                return video.getVolume();
            }
            case 'muted': {
                if (!ready || destroyed) {
                    return null;
                }

                return video.isMuted();
            }
        }
    }
    function onError(error) {
        events.emit('error', error);
        if (error.critical) {
            command('stop');
        }
    }
    function onEnded() {
        events.emit('ended');
    }
    function onPropChanged(propName) {
        if (observedProps[propName]) {
            events.emit('propChanged', propName, getProp(propName));
        }
    }
    function observeProp(propName) {
        if (!observedProps.hasOwnProperty(propName)) {
            throw new Error('observeProp not supported: ' + propName);
        }

        events.emit('propValue', propName, getProp(propName));
        observedProps[propName] = true;
    }
    function setProp(propName, propValue) {
        switch (propName) {
            case 'paused': {
                if (loaded) {
                    propValue ? video.pauseVideo() : video.playVideo();
                }

                break;
            }
            case 'time': {
                if (loaded && propValue !== null && isFinite(propValue)) {
                    video.seekTo(parseInt(propValue) / 1000);
                }

                break;
            }
            case 'volume': {
                if (ready) {
                    if (propValue !== null && isFinite(propValue)) {
                        video.unMute();
                        video.setVolume(Math.max(0, Math.min(100, parseInt(propValue))));
                    }
                } else {
                    actionsQueue.push({
                        type: 'setProp',
                        propName: propName,
                        propValue: propValue
                    });
                }

                break;
            }
            case 'muted': {
                if (ready) {
                    propValue ? video.mute() : video.unMute();
                } else {
                    actionsQueue.push({
                        type: 'setProp',
                        propName: propName,
                        propValue: propValue
                    });
                }

                break;
            }
            default: {
                throw new Error('setProp not supported: ' + propName);
            }
        }
    }
    function command(commandName, commandArgs) {
        switch (commandName) {
            case 'load': {
                if (ready) {
                    command('unload');
                    if (commandArgs && commandArgs.stream && typeof commandArgs.stream.ytId === 'string') {
                        var autoplay = typeof commandArgs.autoplay === 'boolean' ? commandArgs.autoplay : true;
                        var time = commandArgs.time !== null && isFinite(commandArgs.time) ? parseInt(commandArgs.time) / 1000 : 0;
                        if (autoplay) {
                            video.loadVideoById({
                                videoId: commandArgs.stream.ytId,
                                startSeconds: time
                            });
                        } else {
                            video.cueVideoById({
                                videoId: commandArgs.stream.ytId,
                                startSeconds: time
                            });
                        }
                        loaded = true;
                        onPropChanged('paused');
                        onPropChanged('time');
                        onPropChanged('duration');
                        onPropChanged('buffering');
                    }
                } else {
                    actionsQueue.push({
                        type: 'command',
                        commandName: commandName,
                        commandArgs: commandArgs
                    });
                }

                break;
            }
            case 'unload': {
                loaded = false;
                if (ready) {
                    video.stopVideo();
                }
                onPropChanged('paused');
                onPropChanged('time');
                onPropChanged('duration');
                onPropChanged('buffering');
                break;
            }
            case 'destroy': {
                command('unload');
                destroyed = true;
                onPropChanged('volume');
                onPropChanged('muted');
                events.removeAllListeners();
                events.on('error', function() { });
                clearInterval(propChangedIntervalId);
                if (ready) {
                    video.destroy();
                }
                containerElement.removeChild(apiScriptElement);
                containerElement.removeChild(videoContainerElement);
                break;
            }
            default: {
                throw new Error('command not supported: ' + commandName);
            }
        }
    }

    this.on = function(eventName, listener) {
        if (destroyed) {
            throw new Error('Video is destroyed');
        }

        events.on(eventName, listener);
    };
    this.dispatch = function(action) {
        if (destroyed) {
            throw new Error('Video is destroyed');
        }

        if (action) {
            switch (action.type) {
                case 'observeProp': {
                    observeProp(action.propName);
                    return;
                }
                case 'setProp': {
                    setProp(action.propName, action.propValue);
                    return;
                }
                case 'command': {
                    command(action.commandName, action.commandArgs);
                    return;
                }
            }
        }

        throw new Error('Invalid action dispatched: ' + JSON.stringify(action));
    };
}

YouTubeVideo.manifest = {
    name: 'YouTubeVideo',
    embedded: true,
    props: ['paused', 'time', 'duration', 'buffering', 'volume', 'muted']
};

module.exports = YouTubeVideo;
