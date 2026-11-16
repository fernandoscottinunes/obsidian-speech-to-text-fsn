export function calculateRms(samples: Float32Array): number {
    if (!samples || samples.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
        sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
}

/**
 * Converte valor RMS (0.0 a 1.0) para representação em barras de nível (0 a 8 barras)
 */
export function getVuMeterBars(rms: number, peakThreshold = 0.08): string {
    if (rms <= 0.0005) return '░░░░░░░░';

    // Escala não-linear para sensibilidade humana
    const normalized = Math.min(1, Math.sqrt(rms / peakThreshold));
    const totalBars = 8;
    const filledBars = Math.max(1, Math.min(totalBars, Math.round(normalized * totalBars)));

    const filled = '█'.repeat(filledBars);
    const empty = '░'.repeat(totalBars - filledBars);
    return `${filled}${empty}`;
}
