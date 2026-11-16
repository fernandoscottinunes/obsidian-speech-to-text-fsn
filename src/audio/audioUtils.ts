export function isMostlySilence(samples: Float32Array, silenceThreshold: number): boolean {
    if (samples.length === 0) return true;

    let sumSquares = 0;
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
        const value = samples[i];
        const abs = Math.abs(value);
        peak = Math.max(peak, abs);
        sumSquares += value * value;
    }

    const rms = Math.sqrt(sumSquares / samples.length);
    return rms < silenceThreshold && peak < silenceThreshold * 4;
}

export function takeSamplesFromBuffers(sampleBuffers: Float32Array[], count: number): Float32Array {
    const out = new Float32Array(count);
    let offset = 0;

    while (offset < count && sampleBuffers.length > 0) {
        const buffer = sampleBuffers[0];
        const needed = count - offset;

        if (buffer.length <= needed) {
            out.set(buffer, offset);
            offset += buffer.length;
            sampleBuffers.shift();
        } else {
            out.set(buffer.subarray(0, needed), offset);
            sampleBuffers[0] = buffer.subarray(needed);
            offset += needed;
        }
    }

    return out;
}

export function discardSamplesFromBuffers(sampleBuffers: Float32Array[], count: number): number {
    let toDiscard = count;
    let discarded = 0;

    while (toDiscard > 0 && sampleBuffers.length > 0) {
        const buffer = sampleBuffers[0];
        if (buffer.length <= toDiscard) {
            toDiscard -= buffer.length;
            discarded += buffer.length;
            sampleBuffers.shift();
        } else {
            sampleBuffers[0] = buffer.subarray(toDiscard);
            discarded += toDiscard;
            toDiscard = 0;
        }
    }

    return discarded;
}

export function peekSamplesFromBuffers(sampleBuffers: Float32Array[], count: number): Float32Array {
    const totalAvailable = sampleBuffers.reduce((sum, b) => sum + b.length, 0);
    const toRead = Math.min(count, totalAvailable);
    const out = new Float32Array(toRead);
    let offset = 0;

    for (let i = 0; i < sampleBuffers.length && offset < toRead; i++) {
        const buffer = sampleBuffers[i];
        const needed = toRead - offset;
        if (buffer.length <= needed) {
            out.set(buffer, offset);
            offset += buffer.length;
        } else {
            out.set(buffer.subarray(0, needed), offset);
            offset += needed;
        }
    }

    return out;
}
