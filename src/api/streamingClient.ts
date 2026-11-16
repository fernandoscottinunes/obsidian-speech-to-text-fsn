import { STTSettings, TranslateFn } from '../types';

export interface StreamingClientOptions {
    onTranscript: (text: string, isFinal: boolean) => void;
    onError: (error: Error) => void;
    onOpen?: () => void;
    onClose?: () => void;
    t: TranslateFn;
}

export class WebSocketStreamingClient {
    private ws: WebSocket | null = null;
    private isConnected = false;
    private options: StreamingClientOptions;
    private settings: STTSettings;

    constructor(settings: STTSettings, options: StreamingClientOptions) {
        this.settings = settings;
        this.options = options;
    }

    updateSettings(settings: STTSettings) {
        this.settings = settings;
    }

    get connected(): boolean {
        return this.isConnected;
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const rawUrl = (this.settings.wsEndpointUrl || '').trim();
            if (!rawUrl) {
                const err = new Error(this.options.t('wsNoUrlError'));
                this.options.onError(err);
                return reject(err);
            }

            let url = rawUrl;
            // Se houver API key, anexa via query param se ainda não estiver presente
            if (this.settings.apiKey && !url.includes('token=') && !url.includes('api_key=')) {
                const separator = url.includes('?') ? '&' : '?';
                url = `${url}${separator}token=${encodeURIComponent(this.settings.apiKey)}`;
            }

            try {
                this.ws = new WebSocket(url);
                this.ws.binaryType = 'arraybuffer';

                this.ws.onopen = () => {
                    this.isConnected = true;
                    this.options.onOpen?.();
                    resolve();
                };

                this.ws.onmessage = (event: MessageEvent) => {
                    this.handleMessage(event.data);
                };

                this.ws.onerror = (event: Event) => {
                    console.error('Speech-to-Text: WebSocket error:', event);
                    const err = new Error(this.options.t('wsConnectionError'));
                    this.options.onError(err);
                    reject(err);
                };

                this.ws.onclose = () => {
                    this.isConnected = false;
                    this.options.onClose?.();
                };
            } catch (error: any) {
                const err = error instanceof Error ? error : new Error(String(error));
                this.options.onError(err);
                reject(err);
            }
        });
    }

    /**
     * Envia amostras Float32Array convertidas em PCM 16-bit mono
     */
    sendAudio(samples: Float32Array) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        const pcmBuffer = new ArrayBuffer(samples.length * 2);
        const view = new DataView(pcmBuffer);

        for (let i = 0; i < samples.length; i++) {
            const s = Math.max(-1, Math.min(1, samples[i]));
            const intVal = s < 0 ? s * 0x8000 : s * 0x7fff;
            view.setInt16(i * 2, intVal, true);
        }

        this.ws.send(pcmBuffer);
    }

    private handleMessage(data: any) {
        if (typeof data !== 'string') return;

        try {
            const parsed = JSON.parse(data);
            const extracted = this.extractTranscript(parsed);
            if (extracted.text) {
                this.options.onTranscript(extracted.text, extracted.isFinal);
            }
        } catch {
            // Se o servidor retornar texto puro
            if (data.trim()) {
                this.options.onTranscript(data.trim(), true);
            }
        }
    }

    extractTranscript(json: any): { text: string; isFinal: boolean } {
        if (!json || typeof json !== 'object') {
            return { text: '', isFinal: false };
        }

        // Padrão Deepgram
        if (json.channel?.alternatives?.[0]?.transcript) {
            return {
                text: json.channel.alternatives[0].transcript,
                isFinal: Boolean(json.is_final),
            };
        }

        // Padrão AssemblyAI
        if (typeof json.text === 'string' && json.message_type) {
            return {
                text: json.text,
                isFinal: json.message_type === 'FinalTranscript',
            };
        }

        // Padrão WhisperLive / Genérico
        const customField = this.settings.textField || 'text';
        const text = json[customField] ?? json.transcript ?? json.text ?? '';
        return {
            text: typeof text === 'string' ? text : '',
            isFinal: true,
        };
    }

    disconnect() {
        this.isConnected = false;
        if (this.ws) {
            try {
                this.ws.close();
            } catch {
                // ignore
            }
            this.ws = null;
        }
    }
}
