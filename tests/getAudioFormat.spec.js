const getAudioFormat = require('../src/ShellVideo/getAudioFormat');

// Minimal mpv track-list audio entry
const track = (props) => Object.assign({ id: 1, type: 'audio' }, props);

describe('getAudioFormat', () => {
    it('returns null without a codec', () => {
        expect(getAudioFormat(track({}))).toBe(null);
        expect(getAudioFormat(track({ codec: '' }))).toBe(null);
        expect(getAudioFormat(track({ codec: null }))).toBe(null);
    });

    it('returns codec, profile, layout and count', () => {
        expect(getAudioFormat(track({
            codec: 'eac3',
            'codec-profile': 'Dolby Digital Plus + Dolby Atmos',
            'demux-channels': '5.1(side)',
            'demux-channel-count': 6,
        }))).toEqual({
            codec: 'eac3',
            profile: 'Dolby Digital Plus + Dolby Atmos',
            channels: '5.1',
            channelCount: 6,
        });
    });

    it('lowercases the codec and merges PCM variants', () => {
        expect(getAudioFormat(track({ codec: 'AAC' })).codec).toBe('aac');
        expect(getAudioFormat(track({ codec: 'pcm_s16le' })).codec).toBe('pcm');
        expect(getAudioFormat(track({ codec: 'pcm_s24le' })).codec).toBe('pcm');
        expect(getAudioFormat(track({ codec: 'pcm_bluray' })).codec).toBe('pcm');
        expect(getAudioFormat(track({ codec: 'truehd' })).codec).toBe('truehd');
    });

    it('drops an empty or "unknown" profile', () => {
        expect(getAudioFormat(track({ codec: 'eac3' })).profile).toBe(null);
        expect(getAudioFormat(track({ codec: 'eac3', 'codec-profile': '' })).profile).toBe(null);
        expect(getAudioFormat(track({ codec: 'eac3', 'codec-profile': 'unknown' })).profile).toBe(null);
        expect(getAudioFormat(track({ codec: 'eac3', 'codec-profile': 'Unknown' })).profile).toBe(null);
        expect(getAudioFormat(track({ codec: 'dts', 'codec-profile': 'DTS-HD MA + DTS:X' })).profile).toBe('DTS-HD MA + DTS:X');
    });

    it('normalizes layout names to X.Y', () => {
        const channels = (layout) => getAudioFormat(track({ codec: 'flac', 'demux-channels': layout })).channels;
        expect(channels('mono')).toBe('1.0');
        expect(channels('stereo')).toBe('2.0');
        expect(channels('5.1')).toBe('5.1');
        expect(channels('5.1(side)')).toBe('5.1');
        expect(channels('5.0(side)')).toBe('5.0');
        expect(channels('7.1(wide)')).toBe('7.1');
        expect(channels('5.1.2')).toBe('5.1.2');
    });

    it('drops unnamed and unusual layouts but keeps the count', () => {
        // mpv's own Matroska demuxer reports unnamed layouts as "unknownN"
        expect(getAudioFormat(track({ codec: 'dts', 'demux-channels': 'unknown8', 'demux-channel-count': 8 })))
            .toEqual({ codec: 'dts', profile: null, channels: null, channelCount: 8 });
        expect(getAudioFormat(track({ codec: 'ac3', 'demux-channels': 'quad' })).channels).toBe(null);
        expect(getAudioFormat(track({ codec: 'ac3', 'demux-channels': '' })).channels).toBe(null);
        expect(getAudioFormat(track({ codec: 'ac3' })).channels).toBe(null);
    });

    it('drops an invalid channel count', () => {
        expect(getAudioFormat(track({ codec: 'aac' })).channelCount).toBe(null);
        expect(getAudioFormat(track({ codec: 'aac', 'demux-channel-count': 0 })).channelCount).toBe(null);
        expect(getAudioFormat(track({ codec: 'aac', 'demux-channel-count': '2' })).channelCount).toBe(null);
    });
});
