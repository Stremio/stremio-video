var EventEmitter = require('events');
var ERROR = require('../error');

function ChromecastSenderVideo(options) {
    options = options || {};

    var containerElement = options.containerElement;
    if (!(containerElement instanceof HTMLElement)) {
        throw new Error('Container element required to be instance of HTMLElement');
    }

    var chromecastTransport = options.chromecastTransport;
    if (!chromecastTransport) {
        throw new Error('Chromecast transport required');
    }

    var device = chromecastTransport.getCastDevice();
    if (device === null) {
        throw new Error('Chromecast session must be started');
    }

    var deviceNameContainerElement = document.createElement('div');
    deviceNameContainerElement.style.display = 'flex';
    deviceNameContainerElement.style.flexDirection = 'row';
    deviceNameContainerElement.style.alignItems = 'center';
    deviceNameContainerElement.style.justifyContent = 'center';
    deviceNameContainerElement.style.width = '100%';
    deviceNameContainerElement.style.height = '100%';
    deviceNameContainerElement.style.backgroundColor = 'black';
    var deviceNameLabelElement = document.createElement('div');
    deviceNameLabelElement.style.flex = 'none';
    deviceNameLabelElement.style.maxWidth = '80%';
    deviceNameLabelElement.style.fontSize = '5vmin';
    deviceNameLabelElement.style.lineHeight = '1.2em';
    deviceNameLabelElement.style.maxHeight = '3.6em';
    deviceNameLabelElement.style.textAlign = 'center';
    deviceNameLabelElement.style.color = '#FFFFFF90';
    deviceNameLabelElement.innerText = 'Casting to ' + device.friendlyName;
    deviceNameContainerElement.appendChild(deviceNameLabelElement);
    containerElement.appendChild(deviceNameContainerElement);

    chromecastTransport.on('message', onMessage);

    var events = new EventEmitter();
    events.on('error', function() { });

    var destroyed = false;
    var observedProps = {
        stream: false,
        paused: false,
        time: false,
        duration: false,
        buffering: false,
        buffered: false,
        volume: false,
        muted: false,
        subtitlesTracks: false,
        selectedSubtitlesTrackId: false,
        extraSubtitlesTracks: false,
        selectedExtraSubtitlesTrackId: false,
        extraSubtitlesDelay: false,
        extraSubtitlesSize: false,
        extraSubtitlesOffset: false,
        extraSubtitlesTextColor: false,
        extraSubtitlesBackgroundColor: false,
        extraSubtitlesShadowColor: false
    };

    function onTransportError(error) {
        if (destroyed) {
            return;
        }

        events.emit('error', Object.assign({}, ERROR.CHROMECAST_SENDER_VIDEO.MESSAGE_SEND_FAILED, {
            error: error
        }));
    }
    function onMessage(message) {
        var parsedMessage;
        try {
            parsedMessage = JSON.parse(message);
        } catch (error) {
            events.emit('error', Object.assign({}, ERROR.CHROMECAST_SENDER_VIDEO.INVALID_MESSAGE_RECEIVED, {
                error: error,
                data: message
            }));
            return;
        }

        if (!parsedMessage || typeof parsedMessage.event !== 'string') {
            events.emit('error', Object.assign({}, ERROR.CHROMECAST_SENDER_VIDEO.INVALID_MESSAGE_RECEIVED, {
                data: message
            }));
            return;
        }

        var args = Array.isArray(parsedMessage.args) ? parsedMessage.args : [];
        events.emit.apply(events, [parsedMessage.event].concat(args));
    }
    function onPropChanged(propName, propValue) {
        if (observedProps[propName]) {
            events.emit('propChanged', propName, propValue);
        }
    }
    function observeProp(propName) {
        if (observedProps.hasOwnProperty(propName)) {
            observedProps[propName] = true;
        }
    }
    function command(commandName) {
        switch (commandName) {
            case 'destroy': {
                destroyed = true;
                onPropChanged('stream', null);
                onPropChanged('paused', null);
                onPropChanged('time', null);
                onPropChanged('duration', null);
                onPropChanged('buffering', null);
                onPropChanged('buffered', null);
                onPropChanged('volume', null);
                onPropChanged('muted', null);
                onPropChanged('subtitlesTracks', []);
                onPropChanged('selectedSubtitlesTrackId', null);
                onPropChanged('extraSubtitlesTracks', []);
                onPropChanged('selectedExtraSubtitlesTrackId', null);
                onPropChanged('extraSubtitlesDelay', null);
                onPropChanged('extraSubtitlesSize', null);
                onPropChanged('extraSubtitlesOffset', null);
                onPropChanged('extraSubtitlesTextColor', null);
                onPropChanged('extraSubtitlesBackgroundColor', null);
                onPropChanged('extraSubtitlesShadowColor', null);
                events.removeAllListeners();
                events.on('error', function() { });
                chromecastTransport.off('message', onMessage);
                containerElement.removeChild(deviceNameContainerElement);
                break;
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
                    chromecastTransport.sendMessage(action).catch(onTransportError);
                    return;
                }
                case 'setProp': {
                    chromecastTransport.sendMessage(action).catch(onTransportError);
                    return;
                }
                case 'command': {
                    command(action.commandName, action.commandArgs);
                    chromecastTransport.sendMessage(action).catch(onTransportError);
                    return;
                }
            }
        }

        throw new Error('Invalid action dispatched: ' + JSON.stringify(action));
    };
}

ChromecastSenderVideo.canPlayStream = function() {
    return Promise.resolve(true);
};

ChromecastSenderVideo.manifest = {
    name: 'ChromecastSenderVideo',
    external: true,
    props: ['stream', 'paused', 'time', 'duration', 'buffering', 'buffered', 'volume', 'muted', 'subtitlesTracks', 'selectedSubtitlesTrackId', 'extraSubtitlesTracks', 'selectedExtraSubtitlesTrackId', 'extraSubtitlesDelay', 'extraSubtitlesSize', 'extraSubtitlesOffset', 'extraSubtitlesTextColor', 'extraSubtitlesBackgroundColor', 'extraSubtitlesShadowColor'],
    commands: ['load', 'unload', 'destroy', 'addExtraSubtitlesTracks'],
    events: ['propChanged', 'propValue', 'ended', 'error', 'subtitlesTrackLoaded', 'extraSubtitlesTrackLoaded', 'implementationChanged']
};

module.exports = ChromecastSenderVideo;
