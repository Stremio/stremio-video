async function getTracksData(url, cb) {
  let tracks = []
  try {
	const resp = await fetch('http://127.0.0.1:11470/tracks/'+encodeURIComponent(url))
	tracks = await resp.json()
  } catch(e) {
  	console.error(e)
  }
  const audioTracks = tracks.filter(el => el['@type'] === 'Audio')
  const subsTracks = tracks.filter(el => el['@type'] === 'Text')
  cb({ audio: audioTracks, subs: subsTracks })
}

module.exports = getTracksData
