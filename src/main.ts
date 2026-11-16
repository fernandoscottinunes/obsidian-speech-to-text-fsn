import { Notice, Plugin } from 'obsidian';
import {
    AudioSource,
    DEFAULT_SETTINGS,
    STTSettings,
    UILang,
} from './types';
import { translate } from './i18n/translations';
import { encodeWav } from './audio/wavEncoder';
import {
    discardSamplesFromBuffers,
    peekSamplesFromBuffers,
    takeSamplesFromBuffers,
} from './audio/audioUtils';
import { VoiceActivityDetector } from './audio/vadDetector';
import { calculateRms, getVuMeterBars } from './audio/vuMeter';
import { cleanTranscript, updateTail } from './text/textCleaner';
import { formatSmartPunctuation } from './text/punctuationFormatter';
import { sendChunk } from './api/sttClient';
import { TranscriptionQueue } from './api/transcriptionQueue';
import { WebSocketStreamingClient } from './api/streamingClient';
import { RecorderNodeSetup, setupAudioRecorderNode } from './audio/workletRecorder';
import { AudioSourceSelectorModal } from './ui/SourceModal';
import { STTSettingTab } from './ui/SettingsTab';

export default class SpeechToTextPlugin extends Plugin {
    isTranscribing = false;
    currentStream: MediaStream | null = null;
    audioContext: AudioContext | null = null;
    audioProcessor: AudioWorkletNode | ScriptProcessorNode | null = null;
    recorderSetup: RecorderNodeSetup | null = null;
    audioSource: MediaStreamAudioSourceNode | null = null;
    ribbonIconEl: HTMLElement | null = null;
    statusBarItem: HTMLElement | null = null;
    activeSourceName: string | null = null;
    sampleBuffers: Float32Array[] = [];
    samplesCollected = 0;
    targetSampleRate = 16000;
    maxBufferedChunks = 12;
    silenceRmsThreshold = 0.0015;
    maxConsecutiveWordRepeats = 2;
    pendingControllers: AbortController[] = [];
    inactivityTimeoutId: number | null = null;
    lastAudioDetectedAt: number | null = null;
    lastTranscriptTail = '';
    currentLang: UILang = 'en';
    settings!: STTSettings;
    transcriptionQueue!: TranscriptionQueue;
    streamingClient!: WebSocketStreamingClient;
    vadDetector!: VoiceActivityDetector;
    baseOffset: number | null = null;
    private lastVuMeterUpdate = 0;

    async onload() {
        this.settings = await this.loadSettings();
        this.initTranscriptionQueue();
        this.initStreamingClient();
        this.applyTuningSettings();
        this.addSettingTab(new STTSettingTab(this.app, this));
        this.statusBarItem = this.addStatusBarItem();
        this.updateStatusBar(this.t('statusInactive'));

        this.ribbonIconEl = this.addRibbonIcon('mic', this.t('ribbonStart'), () => {
            if (this.isTranscribing) {
                this.stopTranscription();
            } else {
                void this.toggleOrSelectSource();
            }
        });
        this.ribbonIconEl.addClass('stt-ribbon-icon');

        this.addCommand({
            id: 'stt-toggle-transcription',
            name: this.t('cmdToggle'),
            callback: () => {
                void this.toggleOrSelectSource();
            },
        });

        this.addCommand({
            id: 'stt-open-source-modal',
            name: this.t('cmdStartWithSource'),
            callback: () => {
                if (this.isTranscribing) {
                    new Notice(this.t('alreadyRunning'));
                    return;
                }
                new AudioSourceSelectorModal(this.app, this, (source) => {
                    this.startTranscription(source);
                }).open();
            },
        });

        this.addCommand({
            id: 'stt-stop-transcription',
            name: this.t('cmdStop'),
            callback: () => {
                this.stopTranscription();
            },
        });
        this.applyLanguage();
    }

    async toggleOrSelectSource() {
        if (this.isTranscribing) {
            this.stopTranscription();
            return;
        }

        // Se já existe uma fonte gravada, tenta utilizá-la diretamente
        if (this.settings.lastSelectedSourceId) {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const matched = devices.find(
                    (d) => d.kind === 'audioinput' && d.deviceId === this.settings.lastSelectedSourceId
                );
                if (matched) {
                    await this.startTranscription({
                        id: matched.deviceId,
                        name: matched.label || 'Microfone',
                    });
                    return;
                }
            } catch (err) {
                console.warn('Speech-to-Text: Erro ao recuperar dispositivo preferido:', err);
            }
        }

        // Se não houver fonte gravada ou o dispositivo não existir mais, abre o modal
        new AudioSourceSelectorModal(this.app, this, (source) => {
            void this.startTranscription(source);
        }).open();
    }

    async startTranscription(source: AudioSource) {
        if (this.isTranscribing) return;

        // Memoriza o dispositivo selecionado
        if (source?.id && this.settings.lastSelectedSourceId !== source.id) {
            this.settings.lastSelectedSourceId = source.id;
            void this.saveSettings();
        }

        new Notice(this.t('startNotice', { source: source.name }));
        this.isTranscribing = true;
        this.lastTranscriptTail = '';
        this.baseOffset = null;
        this.transcriptionQueue.reset();

        if (this.settings.connectionMode === 'websocket') {
            try {
                await this.streamingClient.connect();
            } catch (wsErr) {
                this.isTranscribing = false;
                return;
            }
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { exact: source.id } },
                video: false,
            });

            const audioTracks = stream.getAudioTracks();
            if (!audioTracks || audioTracks.length === 0) {
                throw new Error(this.t('noTracks'));
            }

            this.currentStream = stream;
            this.activeSourceName = source.name;
            this.markRecording(true);
            await this.startPCMRecorder(stream);
        } catch (error: any) {
            console.error('Speech-to-Text: Failed to start transcription:', error);
            new Notice(this.t('startError', { error: error?.message || String(error) }));
            this.stopTranscription();
        }
    }

    stopTranscription(showNotice = true) {
        if (!this.isTranscribing) return;

        if (this.recorderSetup) {
            this.recorderSetup.cleanup();
            this.recorderSetup = null;
        }
        if (this.audioProcessor) {
            this.audioProcessor.disconnect();
            if ('onaudioprocess' in this.audioProcessor) {
                this.audioProcessor.onaudioprocess = null;
            }
            this.audioProcessor = null;
        }
        if (this.audioSource) {
            this.audioSource.disconnect();
            this.audioSource = null;
        }
        if (this.audioContext) {
            this.audioContext.close().catch(() => null);
            this.audioContext = null;
        }
        if (this.currentStream) {
            this.currentStream.getTracks().forEach((track) => track.stop());
            this.currentStream = null;
        }
        this.activeSourceName = null;
        this.markRecording(false);

        this.sampleBuffers = [];
        this.samplesCollected = 0;
        this.lastTranscriptTail = '';
        this.baseOffset = null;
        if (this.transcriptionQueue) {
            this.transcriptionQueue.abort();
        }
        if (this.streamingClient) {
            this.streamingClient.disconnect();
        }

        this.pendingControllers.forEach((controller) => controller.abort());
        this.pendingControllers = [];
        this.clearInactivityTimer();
        this.lastAudioDetectedAt = null;

        this.isTranscribing = false;
        if (showNotice) {
            new Notice(this.t('stopNotice'));
        }
    }

    private async startPCMRecorder(stream: MediaStream) {
        if (this.audioContext) {
            this.stopTranscription();
        }

        const audioContext = new AudioContext({ sampleRate: this.targetSampleRate });
        this.targetSampleRate = audioContext.sampleRate;
        this.audioContext = audioContext;

        const samplesPerChunk = Math.max(1, Math.round((this.targetSampleRate * this.settings.chunkMs) / 1000));
        this.lastAudioDetectedAt = Date.now();
        this.restartInactivityTimer();

        const onAudioSamples = (channelData: Float32Array) => {
            const clone = new Float32Array(channelData.length);
            clone.set(channelData);

            const rms = calculateRms(clone);

            if (this.settings.connectionMode === 'websocket' && this.streamingClient.connected) {
                const isSpeech = !this.settings.enableVad || this.vadDetector.analyze(clone, this.targetSampleRate).isSpeech;
                this.handleInactivity(isSpeech);
                this.updateRecordingVadStatus(isSpeech, rms);
                if (isSpeech) {
                    this.streamingClient.sendAudio(clone);
                }
                return;
            }

            this.sampleBuffers.push(clone);
            this.samplesCollected += clone.length;
            this.trimBacklog(samplesPerChunk);

            while (this.samplesCollected >= samplesPerChunk) {
                // Peek das amostras para analisar se há fala
                const peekSamples = peekSamplesFromBuffers(this.sampleBuffers, samplesPerChunk);
                const isSpeech = !this.settings.enableVad || this.vadDetector.analyze(peekSamples, this.targetSampleRate).isSpeech;
                this.handleInactivity(isSpeech);
                this.updateRecordingVadStatus(isSpeech, rms);

                if (!isSpeech) {
                    // Silêncio: descarta as amostras para não acumular
                    discardSamplesFromBuffers(this.sampleBuffers, samplesPerChunk);
                    this.samplesCollected -= samplesPerChunk;
                    continue;
                }

                // Há voz: aplica uma margem de sobreposição (overlap) de ~500ms
                // Mantém 500ms no buffer para que a palavra na borda não seja cortada
                const overlapSamples = Math.min(
                    Math.round(this.targetSampleRate * 0.5),
                    Math.round(samplesPerChunk * 0.25)
                );
                const chunkSamples = takeSamplesFromBuffers(this.sampleBuffers, samplesPerChunk);
                const advanceSamples = samplesPerChunk - overlapSamples;
                this.samplesCollected -= advanceSamples;

                // Devolve as amostras de sobreposição para a ponta do buffer
                if (overlapSamples > 0 && chunkSamples.length >= overlapSamples) {
                    const overlapBuffer = chunkSamples.subarray(chunkSamples.length - overlapSamples);
                    this.sampleBuffers.unshift(overlapBuffer);
                }

                const wavBlob = encodeWav(chunkSamples, this.targetSampleRate);
                this.transcriptionQueue.enqueue(wavBlob, 'audio/wav');
            }
        };

        const setup = await setupAudioRecorderNode(audioContext, stream, onAudioSamples);
        this.recorderSetup = setup;
        this.audioProcessor = setup.processorNode;
        this.audioSource = setup.sourceNode;

        const mode = setup.isWorklet ? 'AudioWorklet (thread dedicada)' : 'ScriptProcessor (fallback)';
        console.log(`Speech-to-Text: Captura PCM iniciada [${mode}] com SampleRate ${this.targetSampleRate}`);
    }

    private initTranscriptionQueue() {
        this.transcriptionQueue = new TranscriptionQueue(this.settings, {
            onTranscript: (transcript) => {
                const editor = this.app.workspace.activeEditor?.editor;
                if (!transcript || !editor) return;

                let insertText = cleanTranscript(
                    transcript,
                    this.lastTranscriptTail,
                    this.maxConsecutiveWordRepeats
                );
                if (!insertText) return;

                if (this.baseOffset === null) {
                    this.baseOffset = editor.posToOffset(editor.getCursor());
                }

                // Determina se este ponto no documento é início de frase ou continuação
                let isStartOfSentence = true;
                if (this.baseOffset > 0) {
                    const lookbackChars = Math.min(20, this.baseOffset);
                    const precedingText = editor.getRange(
                        editor.offsetToPos(this.baseOffset - lookbackChars),
                        editor.offsetToPos(this.baseOffset)
                    );
                    // É início de frase se não houver texto anterior ou se terminar com '.', '?', '!', '\n'
                    isStartOfSentence = /(^|\n|[.?!])\s*$/.test(precedingText);
                }

                insertText = formatSmartPunctuation(insertText, {
                    enableCommands: this.settings.enablePunctuationCommands,
                    autoCapitalize: this.settings.autoCapitalize,
                    lang: this.currentLang,
                    isStartOfSentence,
                });
                if (!insertText) return;

                if (this.baseOffset > 0 && insertText && !/^\s/.test(insertText)) {
                    const prevChar = editor.getRange(
                        editor.offsetToPos(this.baseOffset - 1),
                        editor.offsetToPos(this.baseOffset)
                    );
                    if (prevChar && !/\s/.test(prevChar)) {
                        insertText = ' ' + insertText;
                    }
                }

                const insertPos = editor.offsetToPos(this.baseOffset);
                editor.replaceRange(insertText, insertPos);
                this.baseOffset += insertText.length;
                this.lastTranscriptTail = updateTail(this.lastTranscriptTail, insertText);
                editor.setCursor(editor.offsetToPos(this.baseOffset));
            },
            onError: (error) => {
                if (error?.name === 'AbortError' && !this.isTranscribing) {
                    return;
                }
                console.error('Speech-to-Text: Erro ao enviar chunk PCM para STT:', error);
                const errorMessage = error?.message || String(error);
                this.updateStatusBar(this.t('statusError', { message: errorMessage }));
                new Notice(this.t('chunkError', { error: errorMessage }), 7000);
                this.stopTranscription();
            },
            t: this.t.bind(this),
        });
    }

    private initStreamingClient() {
        this.streamingClient = new WebSocketStreamingClient(this.settings, {
            onTranscript: (transcript) => {
                const editor = this.app.workspace.activeEditor?.editor;
                if (!transcript || !editor) return;

                let insertText = cleanTranscript(
                    transcript,
                    this.lastTranscriptTail,
                    this.maxConsecutiveWordRepeats
                );
                if (!insertText) return;

                if (this.baseOffset === null) {
                    this.baseOffset = editor.posToOffset(editor.getCursor());
                }

                let isStartOfSentence = true;
                if (this.baseOffset > 0) {
                    const lookbackChars = Math.min(20, this.baseOffset);
                    const precedingText = editor.getRange(
                        editor.offsetToPos(this.baseOffset - lookbackChars),
                        editor.offsetToPos(this.baseOffset)
                    );
                    isStartOfSentence = /(^|\n|[.?!])\s*$/.test(precedingText);
                }

                insertText = formatSmartPunctuation(insertText, {
                    enableCommands: this.settings.enablePunctuationCommands,
                    autoCapitalize: this.settings.autoCapitalize,
                    lang: this.currentLang,
                    isStartOfSentence,
                });
                if (!insertText) return;

                if (this.baseOffset > 0 && insertText && !/^\s/.test(insertText)) {
                    const prevChar = editor.getRange(
                        editor.offsetToPos(this.baseOffset - 1),
                        editor.offsetToPos(this.baseOffset)
                    );
                    if (prevChar && !/\s/.test(prevChar)) {
                        insertText = ' ' + insertText;
                    }
                }

                const insertPos = editor.offsetToPos(this.baseOffset);
                editor.replaceRange(insertText, insertPos);
                this.baseOffset += insertText.length;
                this.lastTranscriptTail = updateTail(this.lastTranscriptTail, insertText);
                editor.setCursor(editor.offsetToPos(this.baseOffset));
            },
            onError: (error) => {
                if (!this.isTranscribing) return;
                console.error('Speech-to-Text: WebSocket streaming error:', error);
                const errorMessage = error?.message || String(error);
                this.updateStatusBar(this.t('statusError', { message: errorMessage }));
                new Notice(this.t('chunkError', { error: errorMessage }), 7000);
                this.stopTranscription();
            },
            t: this.t.bind(this),
        });
    }

    private trimBacklog(samplesPerChunk: number) {
        const maxSamples = this.maxBufferedChunks * samplesPerChunk;
        if (this.samplesCollected > maxSamples) {
            const overflow = this.samplesCollected - maxSamples;
            const discarded = discardSamplesFromBuffers(this.sampleBuffers, overflow);
            this.samplesCollected -= discarded;
            console.warn(
                'Speech-to-Text: Buffer overflow, discarding old samples to keep performance:',
                overflow
            );
        }
    }

    applyTuningSettings() {
        this.silenceRmsThreshold = Number.isFinite(this.settings.silenceThreshold)
            ? Math.max(0, this.settings.silenceThreshold)
            : 0.0015;
        if (!this.vadDetector) {
            this.vadDetector = new VoiceActivityDetector({
                silenceThreshold: this.silenceRmsThreshold,
            });
        } else {
            this.vadDetector.setThreshold(this.silenceRmsThreshold);
        }
        this.maxBufferedChunks =
            Number.isFinite(this.settings.maxBufferedChunks) && this.settings.maxBufferedChunks > 0
                ? Math.round(this.settings.maxBufferedChunks)
                : 12;
        this.maxConsecutiveWordRepeats =
            Number.isFinite(this.settings.maxConsecutiveWordRepeats) &&
            this.settings.maxConsecutiveWordRepeats >= 1
                ? Math.round(this.settings.maxConsecutiveWordRepeats)
                : 2;
        this.settings.inactivityTimeoutMs =
            Number.isFinite(this.settings.inactivityTimeoutMs) && this.settings.inactivityTimeoutMs >= 0
                ? Math.round(this.settings.inactivityTimeoutMs)
                : 0;
    }

    private resolveLanguage(): UILang {
        if (this.settings.uiLanguage === 'system') {
            const obsLang =
                (this.app.vault as any).getConfig?.('language') ??
                (this.app.vault as any).getConfig?.('lang') ??
                (this.app as any).app?.loadLocalStorage?.('language');
            if (typeof obsLang === 'string' && obsLang.toLowerCase().startsWith('pt')) {
                return 'pt';
            }
            return 'en';
        }
        return this.settings.uiLanguage === 'pt' ? 'pt' : 'en';
    }

    applyLanguage() {
        this.currentLang = this.resolveLanguage();
        if (this.isTranscribing) {
            this.markRecording(true);
        } else {
            this.setRibbonTooltip(this.t('tooltipStart'));
            this.updateStatusBar(this.t('statusInactive'));
        }
    }

    private handleInactivity(hasAudio: boolean) {
        if (this.settings.inactivityTimeoutMs <= 0) return;
        const now = Date.now();
        if (hasAudio) {
            this.lastAudioDetectedAt = now;
            this.restartInactivityTimer();
            return;
        }
        if (this.lastAudioDetectedAt === null) {
            this.lastAudioDetectedAt = now;
            this.restartInactivityTimer();
        }
    }

    private restartInactivityTimer() {
        this.clearInactivityTimer();
        if (this.settings.inactivityTimeoutMs <= 0 || this.lastAudioDetectedAt === null) return;
        this.inactivityTimeoutId = window.setTimeout(() => {
            this.stopTranscription(false);
            new Notice(this.t('inactivityStopNotice'));
        }, this.settings.inactivityTimeoutMs);
    }

    private clearInactivityTimer() {
        if (this.inactivityTimeoutId !== null) {
            window.clearTimeout(this.inactivityTimeoutId);
            this.inactivityTimeoutId = null;
        }
    }

    t(key: string, vars: Record<string, string | number> = {}): string {
        return translate(this.currentLang, key, vars);
    }

    async testEndpointConnection(): Promise<{ success: boolean; durationMs: number; message: string }> {
        if (!this.settings.endpointUrl) {
            throw new Error(this.t('sendChunkError'));
        }

        const sampleRate = 16000;
        const durationSec = 1.0;
        const totalSamples = Math.round(sampleRate * durationSec);
        const testSamples = new Float32Array(totalSamples);
        const freq = 440;
        for (let i = 0; i < totalSamples; i++) {
            testSamples[i] = 0.2 * Math.sin((2 * Math.PI * freq * i) / sampleRate);
        }

        const testBlob = encodeWav(testSamples, sampleRate);
        const startTime = Date.now();

        await sendChunk(this.settings, testBlob, 'audio/wav', this.t.bind(this));
        const durationMs = Date.now() - startTime;

        return {
            success: true,
            durationMs,
            message: this.t('testSuccess', { ms: String(durationMs) }),
        };
    }

    async loadSettings(): Promise<STTSettings> {
        const loaded = await this.loadData();
        return Object.assign({}, DEFAULT_SETTINGS, loaded);
    }

    async saveSettings() {
        await this.saveData(this.settings);
        if (this.transcriptionQueue) {
            this.transcriptionQueue.updateSettings(this.settings);
        }
        if (this.streamingClient) {
            this.streamingClient.updateSettings(this.settings);
        }
    }

    onunload() {
        this.stopTranscription();
    }

    private markRecording(active: boolean) {
        if (this.ribbonIconEl) {
            if (active) {
                this.ribbonIconEl.addClass('stt-recording');
                const statusLine = this.activeSourceName
                    ? this.t('statusRecordingWithSource', { source: this.activeSourceName })
                    : this.t('statusRecording');
                this.setRibbonTooltip(this.t('tooltipStop', { statusLine }));
                this.updateStatusBar(statusLine);
            } else {
                this.ribbonIconEl.removeClass('stt-recording');
                this.setRibbonTooltip(this.t('tooltipStart'));
                this.updateStatusBar(this.t('statusInactive'));
            }
        }
    }

    private setRibbonTooltip(text: string) {
        if (this.ribbonIconEl) {
            this.ribbonIconEl.setAttribute('aria-label', text);
        }
    }

    private updateRecordingVadStatus(isSpeech: boolean, rms = 0) {
        if (!this.isTranscribing) return;
        const now = Date.now();
        // Limita a atualização da UI do VU Meter a cada 100ms para evitar engasgar o Obsidian
        if (now - this.lastVuMeterUpdate < 100) return;
        this.lastVuMeterUpdate = now;

        const source = this.activeSourceName || '';
        const vuMeter = getVuMeterBars(rms);
        const baseKey = isSpeech ? 'statusRecordingSpeech' : 'statusRecordingSilence';
        const baseText = this.t(baseKey, { source });
        this.updateStatusBar(`${baseText} [${vuMeter}]`);
    }

    private updateStatusBar(text: string) {
        if (this.statusBarItem) {
            this.statusBarItem.setText(text);
        }
    }
}
