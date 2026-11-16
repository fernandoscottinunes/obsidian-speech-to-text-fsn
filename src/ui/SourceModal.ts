import { App, Modal } from 'obsidian';
import { AudioSource } from '../types';
import type SpeechToTextPlugin from '../main';

export class AudioSourceSelectorModal extends Modal {
    onSubmit: (source: AudioSource) => void;
    isLoading = true;
    selectEl: HTMLSelectElement | null = null;
    startButton: HTMLButtonElement | null = null;
    statusText: HTMLElement | null = null;
    sources: AudioSource[] = [];
    plugin: SpeechToTextPlugin;

    constructor(app: App, plugin: SpeechToTextPlugin, onSubmit: (source: AudioSource) => void) {
        super(app);
        this.onSubmit = onSubmit;
        this.plugin = plugin;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('stt-source-modal');
        contentEl.createEl('h2', { text: this.plugin.t('modalTitle') });
        contentEl.createDiv({ cls: 'stt-divider' });

        const field = contentEl.createDiv({ cls: 'stt-field' });
        const labelRow = field.createDiv({ cls: 'stt-label-row' });
        labelRow.createEl('div', { text: this.plugin.t('modalSourceLabel'), cls: 'stt-label' });
        this.statusText = labelRow.createEl('div', {
            cls: 'stt-status',
            text: this.plugin.t('modalStatusScanning'),
        });

        field.createEl('div', {
            text: this.plugin.t('modalHelp'),
            cls: 'stt-help',
        });

        this.selectEl = field.createEl('select', { cls: 'dropdown' });

        const actions = contentEl.createDiv({ cls: 'stt-actions' });
        this.startButton = actions.createEl('button', {
            text: this.plugin.t('modalStartButton'),
            cls: 'mod-cta',
        });

        this.selectEl.disabled = true;
        this.startButton.disabled = true;

        this.startButton.onclick = () => {
            const selectedSourceId = this.selectEl?.value;
            const selectedSource = this.sources.find((s) => s.id === selectedSourceId);
            if (selectedSource) {
                this.onSubmit(selectedSource);
                this.close();
            }
        };

        await this.populateSources();
    }

    private async populateSources() {
        const audioSources: AudioSource[] = [];

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter((device) => device.kind === 'audioinput');
            audioInputs.forEach((device, index) => {
                audioSources.push({ id: device.deviceId, name: device.label || `Microfone ${index + 1}` });
            });
        } catch (error) {
            console.error('Speech-to-Text: Erro ao buscar dispositivos de mídia:', error);
        }

        this.sources = audioSources;
        if (audioSources.length === 0) {
            this.statusText?.setText(this.plugin.t('modalNoSources'));
            return;
        }

        if (this.selectEl) {
            this.selectEl.empty();
            let hasSelected = false;
            audioSources.forEach((source) => {
                const isPreferred =
                    this.plugin.settings.lastSelectedSourceId &&
                    source.id === this.plugin.settings.lastSelectedSourceId;
                const option = this.selectEl?.createEl('option', { text: source.name, value: source.id });
                if (isPreferred && option) {
                    option.selected = true;
                    hasSelected = true;
                }
            });
            if (!hasSelected && audioSources.length > 0 && this.selectEl.options[0]) {
                this.selectEl.options[0].selected = true;
            }
            this.selectEl.disabled = false;
        }
        if (this.startButton) {
            this.startButton.disabled = false;
        }
        this.statusText?.setText(this.plugin.t('modalLoaded'));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
