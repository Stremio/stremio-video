var getContentRect = require('./getContentRect');

var TARGET_FPS = 24;

var libassPromise = null;

function decodeBase64(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);

    for (var i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}

function createScriptUrl(source) {
    return URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
}

function createWorkerOptions(assets) {
    if (typeof WebAssembly !== 'object' || typeof WebAssembly.compile !== 'function') {
        return Promise.resolve({ legacyWorkerUrl: createScriptUrl(assets.legacyWorkerSource) });
    }

    var workerUrl = createScriptUrl(assets.workerSource);
    var wasmBinary = decodeBase64(assets.wasmBinary);
    return WebAssembly.compile(wasmBinary).then(function(wasmModule) {
        return { workerUrl: workerUrl, wasmModule: wasmModule };
    }, function() {
        return { workerUrl: workerUrl, wasmBinary: wasmBinary };
    });
}

function loadLibass() {
    if (libassPromise === null) {
        libassPromise = Promise.all([
            import('@stremio/libass-wasm'),
            import('@stremio/libass-wasm/dist/js/subtitles-octopus-assets')
        ]).then(function(modules) {
            var assets = modules[1].default || modules[1];
            return createWorkerOptions(assets).then(function(workerOptions) {
                return {
                    SubtitlesOctopus: modules[0].default || modules[0],
                    workerOptions: workerOptions,
                    fallbackFont: URL.createObjectURL(new Blob([decodeBase64(assets.defaultFont)], { type: 'font/woff2' }))
                };
            });
        }).catch(function(error) {
            libassPromise = null;
            throw error;
        });
    }

    return libassPromise;
}

function createASSRenderer(options) {
    options = options || {};

    var containerElement = options.containerElement;
    if (!(containerElement instanceof HTMLElement)) {
        throw new Error('Container element required to be instance of HTMLElement');
    }

    var instance = null;
    var instanceReady = false;
    var canvas = null;
    var resizeObserver = null;
    var resizeRafId = null;
    var pendingReady = null;
    var requestId = 0;
    var activeTrack = null;
    var delay = 0;
    var opacity = 1;
    var lastTime = null;
    var lastSentTime = null;
    var lastSentAt = 0;

    function finishPending(value, error) {
        var pending = pendingReady;
        pendingReady = null;
        if (pending === null) {
            return;
        }

        if (error) {
            pending.reject(error);
        } else {
            pending.resolve(value);
        }
    }

    function cleanupOverlay() {
        if (resizeRafId !== null) {
            cancelAnimationFrame(resizeRafId);
            resizeRafId = null;
        }
        if (resizeObserver !== null) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
        if (canvas !== null && canvas.parentElement === containerElement) {
            containerElement.removeChild(canvas);
        }
        canvas = null;
        activeTrack = null;
        instanceReady = false;
        lastSentTime = null;
        lastSentAt = 0;
    }

    function disposeCurrent() {
        finishPending(null);
        var currentInstance = instance;
        instance = null;
        if (currentInstance !== null) {
            try {
                currentInstance.dispose();
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error('assRenderer', error);
            }
        }
        cleanupOverlay();
    }

    function releaseFailedInstance() {
        instance = null;
        cleanupOverlay();
    }

    function syncLayout() {
        resizeRafId = null;
        if (instance === null || canvas === null) {
            return;
        }

        var rect = getContentRect(containerElement);
        if (!rect.width || !rect.height) {
            return;
        }

        canvas.style.left = rect.left + 'px';
        canvas.style.top = rect.top + 'px';
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        canvas.style.opacity = String(opacity);

        var pixelRatio = window.devicePixelRatio || 1;
        var width = Math.max(1, Math.floor(rect.width * pixelRatio));
        var height = Math.max(1, Math.floor(rect.height * pixelRatio));
        if (canvas.width !== width || canvas.height !== height) {
            instance.resize(width, height, 0, 0);
        }
    }

    function scheduleLayout() {
        if (resizeRafId === null) {
            resizeRafId = requestAnimationFrame(syncLayout);
        }
    }

    function sendTime(force) {
        if (instance === null || !instanceReady || lastTime === null) {
            return;
        }

        var currentTime = Math.max(0, (lastTime - delay) / 1000);
        var now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        var interval = 1000 / TARGET_FPS;
        if (!force && (currentTime === lastSentTime || now - lastSentAt < interval)) {
            return;
        }

        lastSentTime = currentTime;
        lastSentAt = now;
        instance.setCurrentTime(currentTime);
    }

    function createInstance(libass, subtitleText, track, currentRequestId) {
        canvas = document.createElement('canvas');
        canvas.style.position = 'absolute';
        canvas.style.display = 'block';
        canvas.style.zIndex = '2';
        canvas.style.pointerEvents = 'none';
        containerElement.appendChild(canvas);

        return new Promise(function(resolve, reject) {
            var createdInstance;
            pendingReady = { resolve: resolve, reject: reject };

            try {
                createdInstance = new libass.SubtitlesOctopus(Object.assign({}, libass.workerOptions, {
                    canvas: canvas,
                    subContent: subtitleText,
                    fallbackFont: libass.fallbackFont,
                    // Register the fallback family with fontconfig as well as libass.
                    fonts: [libass.fallbackFont].concat(Array.isArray(track.fonts) ? track.fonts : options.fonts || []),
                    availableFonts: track.availableFonts || options.availableFonts || {},
                    renderMode: 'wasm-blend',
                    targetFps: TARGET_FPS,
                    onReady: function() {
                        if (currentRequestId !== requestId || createdInstance !== instance) {
                            return;
                        }

                        instanceReady = true;
                        syncLayout();
                        sendTime(true);
                        finishPending(track);
                    },
                    onError: function(error) {
                        if (currentRequestId !== requestId || createdInstance !== instance) {
                            return;
                        }

                        if (pendingReady !== null) {
                            pendingReady = null;
                            releaseFailedInstance();
                            reject(error);
                        } else if (typeof options.onError === 'function') {
                            var failedTrack = activeTrack;
                            releaseFailedInstance();
                            options.onError(error, failedTrack);
                        }
                    }
                }));
                if (currentRequestId !== requestId) {
                    createdInstance.dispose();
                    finishPending(null);
                    return;
                }

                instance = createdInstance;
                activeTrack = track;
                resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleLayout);
                if (resizeObserver !== null) {
                    resizeObserver.observe(containerElement);
                    var videoElement = containerElement.querySelector('video');
                    if (videoElement instanceof HTMLVideoElement) {
                        resizeObserver.observe(videoElement);
                    }
                }
                syncLayout();
            } catch (error) {
                pendingReady = null;
                disposeCurrent();
                reject(error);
            }
        });
    }

    function load(track, subtitleText) {
        var currentRequestId = ++requestId;
        disposeCurrent();

        return loadLibass()
            .then(function(libass) {
                if (currentRequestId !== requestId) {
                    return null;
                }

                return createInstance(libass, subtitleText, track, currentRequestId);
            });
    }

    function destroy() {
        requestId = requestId + 1;
        disposeCurrent();
        return Promise.resolve();
    }

    function preload() {
        loadLibass().catch(function() {});
    }

    function setDelay(value) {
        delay = value !== null && isFinite(value) ? parseInt(value, 10) : 0;
        sendTime(true);
    }

    function setTime(value, force) {
        if (value !== null && isFinite(value)) {
            lastTime = Number(value);
            sendTime(force === true);
        }
    }

    function setOpacity(value) {
        opacity = typeof value === 'number' && isFinite(value) ? Math.min(Math.max(value, 0), 1) : 1;
        if (canvas !== null) {
            canvas.style.opacity = String(opacity);
        }
    }

    function setTrack(text) {
        if (instance === null || !instanceReady) return;
        instance.setTrack(text);
        sendTime(true);
    }

    return {
        load: load,
        destroy: destroy,
        preload: preload,
        setDelay: setDelay,
        setTime: setTime,
        setTrack: setTrack,
        setOpacity: setOpacity
    };
}

module.exports = createASSRenderer;
