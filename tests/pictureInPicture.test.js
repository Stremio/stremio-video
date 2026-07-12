const test = require('node:test');
const assert = require('node:assert/strict');
const pictureInPicture = require('../src/HTMLVideo/pictureInPicture');

test('reports Picture in Picture as possible when the browser exposes the API', () => {
    const video = { requestPictureInPicture() {} };
    const documentElement = { pictureInPictureEnabled: true };

    assert.equal(pictureInPicture.isPictureInPicturePossible(video, documentElement), true);
});

test('reports Picture in Picture as unavailable when browser support is missing', () => {
    assert.equal(
        pictureInPicture.isPictureInPicturePossible({ requestPictureInPicture() {} }, { pictureInPictureEnabled: false }),
        false
    );
    assert.equal(
        pictureInPicture.isPictureInPicturePossible({}, { pictureInPictureEnabled: true }),
        false
    );
});

test('reports the active Picture in Picture element', () => {
    const video = {};

    assert.equal(pictureInPicture.isPictureInPictureActive(video, { pictureInPictureElement: video }), true);
    assert.equal(pictureInPicture.isPictureInPictureActive(video, { pictureInPictureElement: {} }), false);
});
