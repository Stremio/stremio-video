var subtitleTypes = require('./subtitleTypes');

var SubtitlesOctopus = null;
var libassAssets = null;

function getSubtitlesOctopus() {
    if (SubtitlesOctopus === null) {
        SubtitlesOctopus = require('@stremio/libass-wasm');
    }

    return SubtitlesOctopus;
}

function getLibassAssets() {
    if (libassAssets === null) {
        libassAssets = require('@stremio/libass-wasm/dist/js/subtitles-octopus-assets');
    }

    return libassAssets;
}

function decodeBase64ToUint8Array(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);

    for (var i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}

function createLibassEmbeddedUrls() {
    var assets = getLibassAssets();

    return {
        workerUrl: URL.createObjectURL(new Blob([assets.workerSource], {
            type: 'text/javascript'
        })),
        legacyWorkerUrl: URL.createObjectURL(new Blob([assets.legacyWorkerSource], {
            type: 'text/javascript'
        })),
        fallbackFont: URL.createObjectURL(new Blob([decodeBase64ToUint8Array(assets.defaultFont)], {
            type: 'font/woff2'
        }))
    };
}

function revokeLibassEmbeddedUrls(urls) {
    if (!urls) return;

    try {
        URL.revokeObjectURL(urls.workerUrl);
        URL.revokeObjectURL(urls.legacyWorkerUrl);
        URL.revokeObjectURL(urls.fallbackFont);
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('assRenderer revoke libass urls failed', error);
    }
}

function getTrackUrl(track, isFallback) {
    return isFallback ? track.fallbackUrl : track.url;
}

function readTrackContent(track, isFallback) {
    var url = getTrackUrl(track, isFallback);

    if (!isFallback && typeof track.content === 'string') {
        return Promise.resolve(track.content);
    }

    if (typeof url === 'string') {
        return fetch(url)
            .then(function(resp) {
                if (resp.ok) {
                    return resp.text();
                }

                throw new Error(resp.status + ' (' + resp.statusText + ')');
            });
    }

    if (!isFallback && track.buffer instanceof ArrayBuffer) {
        try {
            return Promise.resolve(new TextDecoder().decode(new Uint8Array(track.buffer)));
        } catch (error) {
            return Promise.reject(error);
        }
    }

    return Promise.reject(new Error('No `url`, `content` or `buffer` field available for this track'));
}

function getRendererFonts(track, options) {
    if (Array.isArray(track.fonts)) {
        return track.fonts;
    }

    if (Array.isArray(options.fonts)) {
        return options.fonts;
    }

    return [];
}

function getRendererAvailableFonts(track, options) {
    if (track.availableFonts && typeof track.availableFonts === 'object') {
        return track.availableFonts;
    }

    if (options.availableFonts && typeof options.availableFonts === 'object') {
        return options.availableFonts;
    }

    return {};
}

function getVideoContentRect(videoElement) {
    var rect = videoElement.getBoundingClientRect();
    if (!rect.width || !rect.height || !videoElement.videoWidth || !videoElement.videoHeight) {
        return rect;
    }

    var videoRatio = videoElement.videoWidth / videoElement.videoHeight;
    var elementRatio = rect.width / rect.height;
    var width = rect.width;
    var height = rect.height;
    var left = rect.left;
    var top = rect.top;

    if (elementRatio > videoRatio) {
        width = rect.height * videoRatio;
        left = rect.left + (rect.width - width) / 2;
    } else {
        height = rect.width / videoRatio;
        top = rect.top + (rect.height - height) / 2;
    }

    return {
        left: left,
        top: top,
        width: width,
        height: height
    };
}

function installOverlaySync(instance, videoElement, containerElement, getOpacity) {
    var originalResize = instance.resize.bind(instance);
    var rafId = null;
    var resizeObserver = null;
    var disposed = false;

    function syncOverlay() {
        if (disposed) {
            return;
        }

        var canvasParent = instance.canvasParent;
        var canvas = instance.canvas;
        if (!(canvasParent instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
            return;
        }

        var rect = getVideoContentRect(videoElement);
        if (!rect.width || !rect.height) {
            return;
        }

        var pixelRatio = window.devicePixelRatio || 1;
        var width = Math.max(1, Math.floor(rect.width * pixelRatio));
        var height = Math.max(1, Math.floor(rect.height * pixelRatio));
        if (canvas.width !== width || canvas.height !== height) {
            originalResize(width, height, 0, 0);
        }

        var offsetParent = canvasParent.offsetParent || canvasParent.parentElement;
        var offsetRect = offsetParent instanceof HTMLElement ?
            offsetParent.getBoundingClientRect() :
            { left: 0, top: 0 };

        canvasParent.style.position = 'absolute';
        canvasParent.style.left = (rect.left - offsetRect.left) + 'px';
        canvasParent.style.top = (rect.top - offsetRect.top) + 'px';
        canvasParent.style.width = rect.width + 'px';
        canvasParent.style.height = rect.height + 'px';
        canvasParent.style.zIndex = '2';
        canvasParent.style.pointerEvents = 'none';
        canvasParent.style.opacity = String(getOpacity());

        canvas.style.display = 'block';
        canvas.style.position = 'absolute';
        canvas.style.left = '0';
        canvas.style.top = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.zIndex = '2';
        canvas.style.pointerEvents = 'none';
    }

    function scheduleSync() {
        if (rafId !== null) {
            return;
        }

        rafId = requestAnimationFrame(function() {
            rafId = null;
            syncOverlay();
        });
    }

    instance.resize = function() {
        var result = originalResize.apply(instance, arguments);
        scheduleSync();
        return result;
    };

    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(scheduleSync);
        resizeObserver.observe(videoElement);
        resizeObserver.observe(containerElement);
    }

    syncOverlay();
    scheduleSync();
    setTimeout(scheduleSync, 100);

    return function() {
        disposed = true;
        instance.resize = originalResize;
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        if (resizeObserver !== null) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
    };
}

function installCanvasOverlaySync(instance, canvas, containerElement, getOpacity) {
    var rafId = null;
    var resizeObserver = null;
    var disposed = false;

    function syncOverlay() {
        if (disposed) {
            return;
        }

        var rect = containerElement.getBoundingClientRect();
        if (!rect.width || !rect.height) {
            return;
        }

        var pixelRatio = window.devicePixelRatio || 1;
        var width = Math.max(1, Math.floor(rect.width * pixelRatio));
        var height = Math.max(1, Math.floor(rect.height * pixelRatio));
        if ((canvas.width !== width || canvas.height !== height) && typeof instance.resize === 'function') {
            instance.resize(width, height, 0, 0);
        }

        canvas.style.display = 'block';
        canvas.style.position = 'absolute';
        canvas.style.left = '0';
        canvas.style.top = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.zIndex = '2';
        canvas.style.pointerEvents = 'none';
        canvas.style.opacity = String(getOpacity());
    }

    function scheduleSync() {
        if (rafId !== null) {
            return;
        }

        rafId = requestAnimationFrame(function() {
            rafId = null;
            syncOverlay();
        });
    }

    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(scheduleSync);
        resizeObserver.observe(containerElement);
    }

    syncOverlay();
    scheduleSync();
    setTimeout(scheduleSync, 100);

    return function() {
        disposed = true;
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        if (resizeObserver !== null) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
    };
}

function createASSRenderer(options) {
    options = options || {};

    var containerElement = options.containerElement;
    if (!(containerElement instanceof HTMLElement)) {
        throw new Error('Container element required to be instance of HTMLElement');
    }

    var instance = null;
    var overlayCleanup = null;
    var canvasElement = null;
    var libassEmbeddedUrls = null;
    var requestId = 0;
    var delay = 0;
    var opacity = 1;
    var lastTime = null;

    function getVideoElement() {
        if (options.videoElement instanceof HTMLVideoElement) {
            return options.videoElement;
        }

        var videoElement = containerElement.querySelector('video');
        if (videoElement instanceof HTMLVideoElement) {
            return videoElement;
        }

        return null;
    }

    function getLibassEmbeddedUrls() {
        if (libassEmbeddedUrls === null) {
            libassEmbeddedUrls = createLibassEmbeddedUrls();
        }

        return libassEmbeddedUrls;
    }

    function destroyInstance() {
        var currentInstance = instance;
        var currentOverlayCleanup = overlayCleanup;
        var currentCanvasElement = canvasElement;

        instance = null;
        overlayCleanup = null;
        canvasElement = null;

        if (currentOverlayCleanup !== null) {
            currentOverlayCleanup();
        }

        if (currentCanvasElement !== null && currentCanvasElement.parentElement === containerElement) {
            containerElement.removeChild(currentCanvasElement);
        }

        if (!currentInstance) {
            return Promise.resolve();
        }

        try {
            currentInstance.dispose();
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('assRenderer', error);
        }

        return Promise.resolve();
    }

    function createInstance(videoElement, subtitleText, track, currentRequestId) {
        var libassUrls = getLibassEmbeddedUrls();
        var SubtitlesOctopusConstructor = getSubtitlesOctopus();
        var canvas = videoElement === null ? document.createElement('canvas') : null;
        if (canvas !== null) {
            containerElement.appendChild(canvas);
        }

        return new Promise(function(resolve, reject) {
            var resolved = false;
            var instanceOptions = {
                subContent: subtitleText,
                workerUrl: libassUrls.workerUrl,
                legacyWorkerUrl: libassUrls.legacyWorkerUrl,
                fonts: getRendererFonts(track, options),
                availableFonts: getRendererAvailableFonts(track, options),
                fallbackFont: libassUrls.fallbackFont,
                renderMode: 'wasm-blend',
                timeOffset: -delay / 1000,
                onReady: function() {
                    if (currentRequestId !== requestId || instance !== createdInstance) {
                        resolve(null);
                        return;
                    }

                    resolved = true;
                    resolve(track);
                },
                onError: function(error) {
                    if (!resolved) {
                        destroyInstance()
                            .then(function() {
                                reject(error);
                            });
                        return;
                    }

                    if (typeof options.onError === 'function') {
                        options.onError(error, track);
                    }
                }
            };
            var createdInstance;

            if (videoElement !== null) {
                instanceOptions.video = videoElement;
            } else {
                instanceOptions.canvas = canvas;
            }

            createdInstance = new SubtitlesOctopusConstructor(instanceOptions);

            instance = createdInstance;
            if (videoElement !== null) {
                overlayCleanup = installOverlaySync(createdInstance, videoElement, containerElement, function() {
                    return opacity;
                });
            } else {
                canvasElement = canvas;
                overlayCleanup = installCanvasOverlaySync(createdInstance, canvas, containerElement, function() {
                    return opacity;
                });
                if (lastTime !== null) {
                    createdInstance.setCurrentTime(Math.max(0, (lastTime - delay) / 1000));
                }
            }
        });
    }

    function readSubtitleText(track) {
        var preferFallbackUrl = typeof track.fallbackUrl === 'string' && subtitleTypes.hasASSExtension(track.fallbackUrl);

        return readTrackContent(track, preferFallbackUrl)
            .catch(function(error) {
                if (!preferFallbackUrl && typeof track.fallbackUrl === 'string') {
                    return readTrackContent(track, true);
                }

                throw error;
            });
    }

    function load(track) {
        if (!track) {
            return Promise.reject(new Error('Subtitle track is required'));
        }

        var currentRequestId = ++requestId;

        return readSubtitleText(track)
            .then(function(subtitleText) {
                if (currentRequestId !== requestId) {
                    return null;
                }

                if (typeof subtitleText !== 'string' || subtitleText.length === 0) {
                    throw new Error('Missing ASS subtitle content');
                }

                var videoElement = getVideoElement();

                return destroyInstance()
                    .then(function() {
                        if (currentRequestId !== requestId) {
                            return null;
                        }

                        return createInstance(videoElement, subtitleText, track, currentRequestId);
                    });
            });
    }

    function destroy() {
        requestId = requestId + 1;

        return destroyInstance()
            .then(function() {
                revokeLibassEmbeddedUrls(libassEmbeddedUrls);
                libassEmbeddedUrls = null;
            });
    }

    function setDelay(value) {
        delay = isFinite(value) ? parseInt(value, 10) : 0;
        if (!isFinite(delay)) {
            delay = 0;
        }

        if (instance !== null) {
            instance.timeOffset = -delay / 1000;
            if (!(getVideoElement() instanceof HTMLVideoElement) && lastTime !== null && typeof instance.setCurrentTime === 'function') {
                instance.setCurrentTime(Math.max(0, (lastTime - delay) / 1000));
            }
        }
    }

    function setOpacity(value) {
        if (typeof value === 'number' && isFinite(value)) {
            opacity = Math.min(Math.max(value, 0), 1);
        } else {
            opacity = 1;
        }

        if (instance !== null && instance.canvasParent instanceof HTMLElement) {
            instance.canvasParent.style.opacity = String(opacity);
        }
    }

    function canRender() {
        return getVideoElement() instanceof HTMLVideoElement || options.manualTime === true;
    }

    function setTime(value) {
        if (value !== null && isFinite(value)) {
            lastTime = parseInt(value, 10);
            if (instance !== null && !(getVideoElement() instanceof HTMLVideoElement) && typeof instance.setCurrentTime === 'function') {
                instance.setCurrentTime(Math.max(0, (lastTime - delay) / 1000));
            }
        }
    }

    return {
        canRender: canRender,
        load: load,
        destroy: destroy,
        setDelay: setDelay,
        setTime: setTime,
        setOpacity: setOpacity
    };
}

createASSRenderer.isTrack = subtitleTypes.isASSSubtitleTrack;

module.exports = createASSRenderer;
