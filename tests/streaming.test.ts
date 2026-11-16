import { describe, expect, it } from 'vitest';
import { WebSocketStreamingClient } from '../src/api/streamingClient';
import { DEFAULT_SETTINGS } from '../src/types';

describe('WebSocketStreamingClient', () => {
    it('extractTranscript handles Deepgram format correctly', () => {
        const client = new WebSocketStreamingClient(DEFAULT_SETTINGS, {
            onTranscript: () => undefined,
            onError: () => undefined,
            t: (_k) => _k,
        });

        const deepgramPayload = {
            channel: {
                alternatives: [
                    {
                        transcript: 'olá mundo via deepgram',
                        confidence: 0.99,
                    },
                ],
            },
            is_final: true,
        };

        const result = client.extractTranscript(deepgramPayload);
        expect(result.text).toBe('olá mundo via deepgram');
        expect(result.isFinal).toBe(true);
    });

    it('extractTranscript handles AssemblyAI format correctly', () => {
        const client = new WebSocketStreamingClient(DEFAULT_SETTINGS, {
            onTranscript: () => undefined,
            onError: () => undefined,
            t: (_k) => _k,
        });

        const assemblyPayload = {
            message_type: 'FinalTranscript',
            text: 'transcrição final assembly ai',
        };

        const result = client.extractTranscript(assemblyPayload);
        expect(result.text).toBe('transcrição final assembly ai');
        expect(result.isFinal).toBe(true);
    });

    it('extractTranscript handles generic WhisperLive or custom text field', () => {
        const customSettings = {
            ...DEFAULT_SETTINGS,
            textField: 'result_text',
        };

        const client = new WebSocketStreamingClient(customSettings, {
            onTranscript: () => undefined,
            onError: () => undefined,
            t: (_k) => _k,
        });

        const genericPayload = {
            result_text: 'texto em tempo real',
        };

        const result = client.extractTranscript(genericPayload);
        expect(result.text).toBe('texto em tempo real');
        expect(result.isFinal).toBe(true);
    });

    it('rejects connection if wsEndpointUrl is empty', async () => {
        let capturedError: Error | null = null;
        const client = new WebSocketStreamingClient(
            { ...DEFAULT_SETTINGS, wsEndpointUrl: '' },
            {
                onTranscript: () => undefined,
                onError: (err) => {
                    capturedError = err;
                },
                t: (k) => k,
            }
        );

        await expect(client.connect()).rejects.toThrow('wsNoUrlError');
        expect(capturedError).not.toBeNull();
    });
});
