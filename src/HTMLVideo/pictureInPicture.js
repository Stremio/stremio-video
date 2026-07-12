function isPictureInPicturePossible(videoElement, documentElement) {
    return !!videoElement && !!documentElement && documentElement.pictureInPictureEnabled === true &&
        typeof videoElement.requestPictureInPicture === 'function';
}

function isPictureInPictureActive(videoElement, documentElement) {
    return !!videoElement && !!documentElement && documentElement.pictureInPictureElement === videoElement;
}

module.exports = {
    isPictureInPicturePossible: isPictureInPicturePossible,
    isPictureInPictureActive: isPictureInPictureActive
};
