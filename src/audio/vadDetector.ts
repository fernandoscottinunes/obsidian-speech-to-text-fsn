export interface VadOptions {
    silenceThreshold: number; // Limiar de RMS base
    frameSizeMs?: number;     // Tamanho de cada sub-janela em ms (padrão 25ms)
    minActiveFramesRatio?: number; // % mínima de frames com voz (padrão 0.08 = 8%)
    hangoverChunks?: number;  // Quantos chunks subsequentes de silêncio manter após fala (padrão 1)
}

export class VoiceActivityDetector {
    private silenceThreshold: number;
    private frameSizeMs: number;
    private minActiveFramesRatio: number;
    private hangoverChunks: number;
    private hangoverCounter = 0;

    constructor(options: VadOptions) {
        this.silenceThreshold = options.silenceThreshold ?? 0.0015;
        this.frameSizeMs = options.frameSizeMs ?? 25;
        this.minActiveFramesRatio = options.minActiveFramesRatio ?? 0.08;
        this.hangoverChunks = options.hangoverChunks ?? 1;
    }

    setThreshold(threshold: number) {
        this.silenceThreshold = Number.isFinite(threshold) && threshold >= 0 ? threshold : 0.0015;
    }

    reset() {
        this.hangoverCounter = 0;
    }

    /**
     * Analisa o chunk de áudio PCM.
     * Retorna { isSpeech: boolean, rms: number, activeFramesRatio: number }
     */
    analyze(samples: Float32Array, sampleRate: number): {
        isSpeech: boolean;
        rms: number;
        activeFramesRatio: number;
    } {
        if (!samples || samples.length === 0) {
            return { isSpeech: false, rms: 0, activeFramesRatio: 0 };
        }

        const samplesPerFrame = Math.max(1, Math.round((sampleRate * this.frameSizeMs) / 1000));
        let totalSumSquares = 0;
        let activeFrames = 0;
        let totalFrames = 0;

        for (let offset = 0; offset < samples.length; offset += samplesPerFrame) {
            const frameLength = Math.min(samplesPerFrame, samples.length - offset);
            let frameSumSquares = 0;
            let frameSum = 0;

            for (let i = 0; i < frameLength; i++) {
                const val = samples[offset + i];
                frameSum += val;
            }

            // Remoção de offset DC
            const mean = frameSum / frameLength;

            for (let i = 0; i < frameLength; i++) {
                const centered = samples[offset + i] - mean;
                frameSumSquares += centered * centered;
                totalSumSquares += centered * centered;
            }

            const frameRms = Math.sqrt(frameSumSquares / frameLength);
            if (frameRms >= this.silenceThreshold) {
                activeFrames++;
            }
            totalFrames++;
        }

        const overallRms = Math.sqrt(totalSumSquares / samples.length);
        const activeFramesRatio = totalFrames > 0 ? activeFrames / totalFrames : 0;
        const rawSpeechDetected = activeFramesRatio >= this.minActiveFramesRatio;

        let isSpeech = rawSpeechDetected;

        if (rawSpeechDetected) {
            this.hangoverCounter = this.hangoverChunks;
        } else if (this.hangoverCounter > 0) {
            // Aplica margem temporal (hangover) para não cortar finais de palavras
            isSpeech = true;
            this.hangoverCounter--;
        }

        return {
            isSpeech,
            rms: overallRms,
            activeFramesRatio,
        };
    }
}
