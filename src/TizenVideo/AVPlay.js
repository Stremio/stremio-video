const SCOPE = 'AVPlay';

const createAVPlay = (transport) => {
    const getState = () => {
        return transport.request(SCOPE, 'getState');
    };

    const getCurrentTime = () => {
        return transport.request(SCOPE, 'getCurrentTime');
    };

    const getDuration = () => {
        return transport.request(SCOPE, 'getDuration');
    };

    const getTotalTrackInfo = () => {
        return transport.request(SCOPE, 'getTotalTrackInfo');
    };

    const getCurrentStreamInfo = () => {
        return transport.request(SCOPE, 'getCurrentStreamInfo');
    };

    const open = (path) => {
        return transport.request(SCOPE, 'open', path);
    };

    const prepareAsync = async (successHandler, errorHandler) => {
        const [handler, handlerResult] = await transport.request(SCOPE, 'prepareAsync', 'handler:success', 'handler:error');
        if (handler === 'handler:success') successHandler();
        if (handler === 'handler:error') errorHandler(...handlerResult);
    };

    const pause = () => {
        return transport.request(SCOPE, 'pause');
    };

    const play = () => {
        return transport.request(SCOPE, 'play');
    };

    const stop = () => {
        return transport.request(SCOPE, 'stop');
    };

    const seekTo = (time) => {
        return transport.request(SCOPE, 'seekTo', time);
    };

    const setSpeed = (rate) => {
        return transport.request(SCOPE, 'setSpeed', rate);
    };

    const setSelectTrack = (type, id) => {
        return transport.request(SCOPE, 'setSelectTrack', type, id);
    };

    const setDisplayRect = (x, y, width, height) => {
        return transport.request(SCOPE, 'setDisplayRect', x, y, width, height);
    };

    const setDisplayMethod = (method) => {
        return transport.request(SCOPE, 'setDisplayMethod', method);
    };

    const setListener = (listener) => {
        const handlers = Object.keys(listener).map((name) => `handler:${name}`);
        const onHandlerResponse = (handler, handlerResult) => {
            const name = handler.replace('handler:', '');
            if (listener[name]) {
                handlerResult ? listener[name](...handlerResult) : listener[name]();
            }
        };

        transport.listen(SCOPE, 'setListener', onHandlerResponse, ...handlers);
    };

    return {
        getState,
        getCurrentTime,
        getDuration,
        getTotalTrackInfo,
        getCurrentStreamInfo,
        open,
        prepareAsync,
        pause,
        play,
        stop,
        seekTo,
        setSpeed,
        setSelectTrack,
        setDisplayRect,
        setDisplayMethod,
        setListener,
    };
};

module.exports = createAVPlay;
