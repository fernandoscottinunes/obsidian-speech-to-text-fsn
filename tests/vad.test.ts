import { describe, expect, it } from 'vitest';
import { VoiceActivityDetector } from '../src/audio/vadDetector';

describe('VoiceActivityDetector', () => {
    const sampleRate = 16000;

    it('should detect silence when samples are all zeros or below threshold', () => {
        const vad = new VoiceActivityDetector({ silenceThreshold: 0.002 });
        const silentChunk = new Float32Array(sampleRate * 2); // 2 segundos de silêncio

        const result = vad.analyze(silentChunk, sampleRate);
        expect(result.isSpeech).toBe(false);
        expect(result.rms).toBe(0);
        expect(result.activeFramesRatio).toBe(0);
    });

    it('should detect speech when audio has burst of voice activity above threshold', () => {
        const vad = new VoiceActivityDetector({
            silenceThreshold: 0.002,
            minActiveFramesRatio: 0.05,
        });

        const totalSamples = sampleRate * 2; // 2 segundos
        const speechChunk = new Float32Array(totalSamples);

        // Insere 500ms de sinal senoidal vocal (400Hz com amplitude 0.2)
        const start = Math.round(sampleRate * 0.5);
        const end = Math.round(sampleRate * 1.0);
        for (let i = start; i < end; i++) {
            speechChunk[i] = 0.2 * Math.sin((2 * Math.PI * 400 * i) / sampleRate);
        }

        const result = vad.analyze(speechChunk, sampleRate);
        expect(result.isSpeech).toBe(true);
        expect(result.activeFramesRatio).toBeGreaterThan(0.05);
    });

    it('should remove DC offset and not falsely flag DC bias as speech', () => {
        const vad = new VoiceActivityDetector({ silenceThreshold: 0.002 });
        const dcOffsetChunk = new Float32Array(sampleRate);
        // Deslocamento constante de 0.05 (ruído DC em microfones USB sem som)
        dcOffsetChunk.fill(0.05);

        const result = vad.analyze(dcOffsetChunk, sampleRate);
        expect(result.isSpeech).toBe(false);
        expect(result.rms).toBeCloseTo(0, 5);
    });

    it('should apply hangover chunks to avoid clipping trailing speech frames', () => {
        const vad = new VoiceActivityDetector({
            silenceThreshold: 0.002,
            minActiveFramesRatio: 0.05,
            hangoverChunks: 1,
        });

        const totalSamples = sampleRate;
        const speechChunk = new Float32Array(totalSamples);
        // Voz em 25% do chunk
        for (let i = 0; i < totalSamples * 0.25; i++) {
            speechChunk[i] = 0.15 * Math.sin((2 * Math.PI * 300 * i) / sampleRate);
        }

        const r1 = vad.analyze(speechChunk, sampleRate);
        expect(r1.isSpeech).toBe(true);

        // Próximo chunk é puramente silencioso, mas hangover = 1 deve mantê-lo ativo
        const silentChunk = new Float32Array(totalSamples);
        const r2 = vad.analyze(silentChunk, sampleRate);
        expect(r2.isSpeech).toBe(true); // Mantido pelo hangover

        // Terceiro chunk silencioso deve agora ser falso (hangover expirado)
        const r3 = vad.analyze(silentChunk, sampleRate);
        expect(r3.isSpeech).toBe(false);
    });
});
