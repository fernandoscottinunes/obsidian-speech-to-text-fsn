import { describe, expect, it, vi } from 'vitest';
import { PCM_WORKLET_CODE, setupAudioRecorderNode } from '../src/audio/workletRecorder';

describe('workletRecorder', () => {
    it('PCM_WORKLET_CODE contains processor definition and registration', () => {
        expect(PCM_WORKLET_CODE).toContain('class PCMWorkletProcessor extends AudioWorkletProcessor');
        expect(PCM_WORKLET_CODE).toContain("registerProcessor('pcm-worklet-processor', PCMWorkletProcessor)");
    });

    it('falls back to ScriptProcessorNode when AudioWorklet is unavailable', async () => {
        const mockSourceNode = {
            connect: vi.fn(),
            disconnect: vi.fn(),
        } as unknown as MediaStreamAudioSourceNode;

        const mockScriptNode = {
            connect: vi.fn(),
            disconnect: vi.fn(),
            onaudioprocess: null,
        } as unknown as ScriptProcessorNode;

        const mockAudioContext = {
            audioWorklet: undefined, // Simula ambiente sem suporte ou com falha no worklet
            createMediaStreamSource: vi.fn().mockReturnValue(mockSourceNode),
            createScriptProcessor: vi.fn().mockReturnValue(mockScriptNode),
            destination: {},
        } as unknown as AudioContext;

        const mockStream = {} as MediaStream;
        const samplesReceived: Float32Array[] = [];

        const setup = await setupAudioRecorderNode(mockAudioContext, mockStream, (samples) => {
            samplesReceived.push(samples);
        });

        expect(setup.isWorklet).toBe(false);
        expect(setup.processorNode).toBe(mockScriptNode);
        expect(mockSourceNode.connect).toHaveBeenCalledWith(mockScriptNode);

        // Testa o disparo do evento de áudio simulado
        const testAudioData = new Float32Array([1.0, 0.5, -0.5]);
        const mockEvent = {
            inputBuffer: {
                getChannelData: vi.fn().mockReturnValue(testAudioData),
            },
        } as unknown as AudioProcessingEvent;

        if (mockScriptNode.onaudioprocess) {
            mockScriptNode.onaudioprocess(mockEvent);
        }

        expect(samplesReceived.length).toBe(1);
        expect(Array.from(samplesReceived[0])).toEqual([1.0, 0.5, -0.5]);

        // Testa limpeza
        setup.cleanup();
        expect(mockScriptNode.disconnect).toHaveBeenCalled();
        expect(mockSourceNode.disconnect).toHaveBeenCalled();
    });
});
