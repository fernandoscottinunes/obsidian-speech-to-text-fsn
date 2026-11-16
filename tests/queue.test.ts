import { describe, expect, it, vi } from 'vitest';
import { TranscriptionQueue } from '../src/api/transcriptionQueue';
import { DEFAULT_SETTINGS } from '../src/types';
import * as sttClient from '../src/api/sttClient';

describe('TranscriptionQueue', () => {
    it('should process chunks in strict FIFO order', async () => {
        const processedOrder: number[] = [];
        const sendChunkSpy = vi.spyOn(sttClient, 'sendChunk').mockImplementation(async (_settings, _blob) => {
            return 'transcrito';
        });

        const queue = new TranscriptionQueue(DEFAULT_SETTINGS, {
            onTranscript: (_text, chunkId) => {
                processedOrder.push(chunkId);
            },
            onError: () => undefined,
            t: (_k) => _k,
        });

        const dummyBlob1 = new Blob(['1']);
        const dummyBlob2 = new Blob(['2']);
        const dummyBlob3 = new Blob(['3']);

        queue.enqueue(dummyBlob1);
        queue.enqueue(dummyBlob2);
        queue.enqueue(dummyBlob3);

        // Aguarda processamento da fila
        await vi.waitFor(() => expect(processedOrder.length).toBe(3));

        expect(processedOrder).toEqual([1, 2, 3]);
        sendChunkSpy.mockRestore();
    });

    it('should retry on transient network error and succeed on subsequent attempt', async () => {
        let attempts = 0;
        const sendChunkSpy = vi.spyOn(sttClient, 'sendChunk').mockImplementation(async () => {
            attempts++;
            if (attempts === 1) {
                throw new Error('503 Service Unavailable');
            }
            return 'sucesso após retry';
        });

        let resultTranscript = '';
        const queue = new TranscriptionQueue(DEFAULT_SETTINGS, {
            maxRetries: 2,
            initialBackoffMs: 10,
            onTranscript: (text) => {
                resultTranscript = text;
            },
            onError: () => undefined,
            t: (_k) => _k,
        });

        queue.enqueue(new Blob(['audio']));

        await vi.waitFor(() => expect(resultTranscript).toBe('sucesso após retry'));
        expect(attempts).toBe(2);
        sendChunkSpy.mockRestore();
    });

    it('should not retry on fatal 401 error', async () => {
        let attempts = 0;
        let capturedError: Error | null = null;

        const sendChunkSpy = vi.spyOn(sttClient, 'sendChunk').mockImplementation(async () => {
            attempts++;
            throw new Error('Chave de API inválida (HTTP 401)');
        });

        const queue = new TranscriptionQueue(DEFAULT_SETTINGS, {
            maxRetries: 3,
            initialBackoffMs: 10,
            onTranscript: () => undefined,
            onError: (err) => {
                capturedError = err;
            },
            t: (_k) => _k,
        });

        queue.enqueue(new Blob(['audio']));

        await vi.waitFor(() => expect(capturedError).not.toBeNull());
        expect(attempts).toBe(1); // Não deve tentar novamente
        expect((capturedError as Error | null)?.message).toContain('HTTP 401');
        sendChunkSpy.mockRestore();
    });

    it('should clear queue and abort in-flight requests on abort()', async () => {
        const sendChunkSpy = vi.spyOn(sttClient, 'sendChunk').mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return 'nunca';
        });

        const queue = new TranscriptionQueue(DEFAULT_SETTINGS, {
            onTranscript: () => undefined,
            onError: () => undefined,
            t: (_k) => _k,
        });

        queue.enqueue(new Blob(['1']));
        queue.enqueue(new Blob(['2']));
        queue.abort();

        expect(queue.pendingCount).toBe(0);
        sendChunkSpy.mockRestore();
    });
});
