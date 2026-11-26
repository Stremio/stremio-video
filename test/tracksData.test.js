var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var test = require('node:test');
var vm = require('node:vm');
async function request(server, result) {
    var requested;
    var context = { module: { exports: {} }, encodeURIComponent: encodeURIComponent, console: { error: function() {} },
        fetch: function(url) { requested = url; return Promise.resolve({ json: function() { return Promise.resolve(result); } }); }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/tracksData.js'), 'utf8'), context);
    var response = await new Promise(function(resolve) { context.module.exports('https://example.invalid/movie.mkv?x=1', resolve, server); });
    return { url: requested, result: JSON.parse(JSON.stringify(response)) };
}
test('uses the supplied streaming server and URL-encodes the media link', async function() {
    var r = await request('http://example.invalid:11470/', [{ id: 2, type: 'audio' }, { id: 3, type: 'text' }]);
    assert.equal(r.url, 'http://example.invalid:11470/tracks/https%3A%2F%2Fexample.invalid%2Fmovie.mkv%3Fx%3D1');
    assert.equal(r.result.audio[0].id, 2); assert.equal(r.result.subs[0].id, 3);
});
test('preserves the loopback default for existing callers', async function() {
    assert.ok((await request(undefined, [])).url.startsWith('http://127.0.0.1:11470/tracks/'));
});
test('fails safely when metadata is unavailable or malformed', async function() {
    assert.equal((await request(undefined, {})).result, false);
});
