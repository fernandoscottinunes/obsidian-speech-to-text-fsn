import { describe, expect, it } from 'vitest';
import { calculateRms, getVuMeterBars } from '../src/audio/vuMeter';

describe('vuMeter', () => {
    it('calculateRms returns 0 for empty or zeroed array', () => {
        expect(calculateRms(new Float32Array([]))).toBe(0);
        expect(calculateRms(new Float32Array([0, 0, 0]))).toBe(0);
    });

    it('calculateRms accurately computes RMS', () => {
        const samples = new Float32Array([1.0, -1.0, 1.0, -1.0]);
        expect(calculateRms(samples)).toBe(1.0);
    });

    it('getVuMeterBars returns empty bars when sound is negligible', () => {
        const bars = getVuMeterBars(0.0001);
        expect(bars).toBe('░░░░░░░░');
    });

    it('getVuMeterBars returns full bars when sound reaches peak', () => {
        const bars = getVuMeterBars(0.1);
        expect(bars).toBe('████████');
    });

    it('getVuMeterBars returns progressive bars for intermediate signal', () => {
        const barsLow = getVuMeterBars(0.005);
        const barsHigh = getVuMeterBars(0.04);
        expect(barsLow.includes('█')).toBe(true);
        expect(barsHigh.includes('█')).toBe(true);
        expect(barsHigh.split('█').length).toBeGreaterThan(barsLow.split('█').length);
    });
});
