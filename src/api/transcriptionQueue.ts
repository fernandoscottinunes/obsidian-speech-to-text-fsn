import { STTSettings, TranslateFn } from '../types';
import { sendChunk } from './sttClient';

export interface QueueItem {
    id: number;
    blob: Blob;
    mimeType: string;
}

export interface TranscriptionQueueOptions {
    maxRetries?: number;
    initialBackoffMs?: number;
    onTranscript: (transcript: string, chunkId: number) => void;
    onError: (error: Error, chunkId: number) => void;
    t: TranslateFn;
}

export class TranscriptionQueue {
    private queue: QueueItem[] = [];
    private isProcessing = false;
    private isAborted = false;
    private nextId = 1;
    private activeController: AbortController | null = null;
    private options: TranscriptionQueueOptions;
    private settings: STTSettings;

    constructor(settings: STTSettings, options: TranscriptionQueueOptions) {
        this.settings = settings;
        this.options = {
            maxRetries: 3,
            initialBackoffMs: 500,
            ...options,
        };
    }

    updateSettings(settings: STTSettings) {
        this.settings = settings;
    }

    enqueue(blob: Blob, mimeType = 'audio/wav'): number {
        if (this.isAborted) return -1;

        const id = this.nextId++;
        this.queue.push({ id, blob, mimeType });
        this.processNext();
        return id;
    }

    private async processNext() {
        if (this.isProcessing || this.isAborted || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;
        const currentItem = this.queue[0];

        try {
            const transcript = await this.sendWithRetry(currentItem);
            if (transcript && !this.isAborted) {
                this.options.onTranscript(transcript, currentItem.id);
            }
            this.queue.shift(); // Remove chunk concluído
        } catch (error: any) {
            if (!this.isAborted) {
                this.options.onError(error instanceof Error ? error : new Error(String(error)), currentItem.id);
            }
            this.queue.shift();
        } finally {
            this.isProcessing = false;
            if (!this.isAborted && this.queue.length > 0) {
                this.processNext();
            }
        }
    }

    private async sendWithRetry(item: QueueItem): Promise<string | null> {
        const maxRetries = this.options.maxRetries ?? 3;
        const initialBackoff = this.options.initialBackoffMs ?? 500;
        let attempt = 0;

        while (attempt < maxRetries && !this.isAborted) {
            attempt++;
            try {
                return await sendChunk(
                    this.settings,
                    item.blob,
                    item.mimeType,
                    this.options.t,
                    (controller) => {
                        this.activeController = controller;
                    },
                    (controller) => {
                        if (this.activeController === controller) {
                            this.activeController = null;
                        }
                    }
                );
            } catch (error: any) {
                if (this.isAborted) {
                    throw error;
                }

                // Erros definitivos que não devem ter retentativa
                const isFatal = this.isFatalError(error);
                if (isFatal || attempt >= maxRetries) {
                    throw error;
                }

                // Backoff exponencial com pequeno atraso antes de tentar novamente
                const delayMs = initialBackoff * Math.pow(2, attempt - 1);
                await this.delay(delayMs);
            }
        }

        return null;
    }

    private isFatalError(error: any): boolean {
        if (!error) return false;
        if (error.name === 'AbortError') return true;

        const msg = String(error.message || '');
        // 401 (Chave inválida), 403 (Sem permissão), 404 (Endpoint inexistente)
        if (msg.includes('401') || msg.includes('403') || msg.includes('404')) {
            return true;
        }

        return false;
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    abort() {
        this.isAborted = true;
        this.queue = [];
        if (this.activeController) {
            this.activeController.abort();
            this.activeController = null;
        }
    }

    reset() {
        this.abort();
        this.isAborted = false;
        this.isProcessing = false;
        this.nextId = 1;
    }

    get pendingCount(): number {
        return this.queue.length;
    }
}
