function getContentRect(containerElement) {
    var containerRect = containerElement.getBoundingClientRect();
    var videoElement = containerElement.querySelector('video');
    if (!(videoElement instanceof HTMLVideoElement) || !videoElement.videoWidth || !videoElement.videoHeight) {
        return { left: 0, top: 0, width: containerRect.width, height: containerRect.height };
    }

    var videoRect = videoElement.getBoundingClientRect();
    var objectFit = window.getComputedStyle(videoElement).objectFit || 'contain';
    var left = videoRect.left - containerRect.left;
    var top = videoRect.top - containerRect.top;
    if (objectFit === 'fill') {
        return { left: left, top: top, width: videoRect.width, height: videoRect.height };
    }

    var containScale = Math.min(videoRect.width / videoElement.videoWidth, videoRect.height / videoElement.videoHeight);
    var scale = objectFit === 'cover' ?
        Math.max(videoRect.width / videoElement.videoWidth, videoRect.height / videoElement.videoHeight) :
        containScale;
    if (objectFit === 'none') {
        scale = 1;
    } else if (objectFit === 'scale-down') {
        scale = Math.min(1, containScale);
    }

    var width = videoElement.videoWidth * scale;
    var height = videoElement.videoHeight * scale;
    return {
        left: left + (videoRect.width - width) / 2,
        top: top + (videoRect.height - height) / 2,
        width: width,
        height: height
    };
}

module.exports = getContentRect;
