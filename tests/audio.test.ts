import { describe, expect, it } from 'vitest';
import { encodeWav } from '../src/audio/wavEncoder';
import {
    discardSamplesFromBuffers,
    isMostlySilence,
    takeSamplesFromBuffers,
} from '../src/audio/audioUtils';

describe('wavEncoder', () => {
    it('should generate a valid 16-bit PCM WAV blob with RIFF and WAVE headers', async () => {
        const sampleRate = 16000;
        const samples = new Float32Array([0, 0.5, -0.5, 1.0, -1.0]);
        const blob = encodeWav(samples, sampleRate);

        expect(blob.type).toBe('audio/wav');
        expect(blob.size).toBe(44 + samples.length * 2);

        const arrayBuffer = await blob.arrayBuffer();
        const view = new DataView(arrayBuffer);

        const readString = (offset: number, length: number) => {
            let s = '';
            for (let i = 0; i < length; i++) {
                s += String.fromCharCode(view.getUint8(offset + i));
            }
            return s;
        };

        expect(readString(0, 4)).toBe('RIFF');
        expect(view.getUint32(4, true)).toBe(36 + samples.length * 2);
        expect(readString(8, 4)).toBe('WAVE');
        expect(readString(12, 4)).toBe('fmt ');
        expect(view.getUint32(16, true)).toBe(16); // PCM chunk size
        expect(view.getUint16(20, true)).toBe(1); // PCM format
        expect(view.getUint16(22, true)).toBe(1); // Channels: 1 (mono)
        expect(view.getUint32(24, true)).toBe(sampleRate);
        expect(view.getUint32(28, true)).toBe(sampleRate * 2); // Byte rate
        expect(view.getUint16(32, true)).toBe(2); // Block align
        expect(view.getUint16(34, true)).toBe(16); // Bits per sample
        expect(readString(36, 4)).toBe('data');
        expect(view.getUint32(40, true)).toBe(samples.length * 2);
    });
});

describe('audioUtils', () => {
    it('isMostlySilence should detect silence vs active audio', () => {
        const threshold = 0.0015;
        const silentSamples = new Float32Array([0.0001, -0.0001, 0, 0.0002]);
        expect(isMostlySilence(silentSamples, threshold)).toBe(true);

        const activeSamples = new Float32Array([0.1, -0.2, 0.3, -0.4]);
        expect(isMostlySilence(activeSamples, threshold)).toBe(false);

        expect(isMostlySilence(new Float32Array([]), threshold)).toBe(true);
    });

    it('takeSamplesFromBuffers should correctly extract samples from buffered chunks', () => {
        const b1 = new Float32Array([1, 2, 3]);
        const b2 = new Float32Array([4, 5]);
        const b3 = new Float32Array([6, 7, 8]);
        const buffers = [b1, b2, b3];

        const taken = takeSamplesFromBuffers(buffers, 4);
        expect(Array.from(taken)).toEqual([1, 2, 3, 4]);
        expect(buffers.length).toBe(2);
        expect(Array.from(buffers[0])).toEqual([5]);
        expect(Array.from(buffers[1])).toEqual([6, 7, 8]);
    });

    it('discardSamplesFromBuffers should correctly drop older overflow samples', () => {
        const b1 = new Float32Array([1, 2, 3]);
        const b2 = new Float32Array([4, 5, 6]);
        const buffers = [b1, b2];

        const discarded = discardSamplesFromBuffers(buffers, 4);
        expect(discarded).toBe(4);
        expect(buffers.length).toBe(1);
        expect(Array.from(buffers[0])).toEqual([5, 6]);
    });
});
