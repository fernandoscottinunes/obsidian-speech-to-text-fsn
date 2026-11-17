import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { PROVIDER_PRESETS } from '../api/providerPresets';
import type SpeechToTextPlugin from '../main';

export class STTSettingTab extends PluginSettingTab {
  plugin: SpeechToTextPlugin;

  constructor(app: App, plugin: SpeechToTextPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const t = this.plugin.t.bind(this.plugin);
    containerEl.createEl('h2', { text: t('settingsTitle') });

    new Setting(containerEl)
      .setName(t('settingUiLanguageName'))
      .setDesc(t('settingUiLanguageDesc'))
      .addDropdown((dropdown) =>
        dropdown
          .addOption('system', t('settingUiOptionSystem'))
          .addOption('en', t('settingUiOptionEn'))
          .addOption('pt', t('settingUiOptionPt'))
          .setValue(this.plugin.settings.uiLanguage)
          .onChange(async (value) => {
            this.plugin.settings.uiLanguage = value === 'pt' || value === 'system' ? value : 'en';
            await this.plugin.saveSettings();
            this.plugin.applyLanguage();
          }),
      );

    new Setting(containerEl)
      .setName(t('settingUseDefaultSourceName'))
      .setDesc(t('settingUseDefaultSourceDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.useDefaultAudioSource).onChange(async (value) => {
          this.plugin.settings.useDefaultAudioSource = value;
          await this.plugin.saveSettings();
          await populateDefaultSourceDropdown(value);
        }),
      );
    
    let defaultSourceDropdown: any = null;
    const defaultSourceSetting = new Setting(containerEl);

    const populateDefaultSourceDropdown = async (enabled: boolean) => {
      if (!defaultSourceDropdown) return;

      defaultSourceDropdown.selectEl.empty();

      if (!enabled) {
        defaultSourceDropdown.addOption('', t('settingDefaultSourceDisabled'));
        defaultSourceDropdown.setValue('');
        defaultSourceDropdown.setDisabled(true);
        defaultSourceSetting.settingEl.addClass('stt-setting-disabled');
        return;
      }

      defaultSourceSetting.settingEl.removeClass('stt-setting-disabled');
      defaultSourceDropdown.addOption('', t('settingDefaultSourceLoading'));
      defaultSourceDropdown.setDisabled(true);

      try {
        const devices = await navigator.mediaDevices?.enumerateDevices();
        const audioInputs = devices ? devices.filter((d) => d.kind === 'audioinput') : [];
        defaultSourceDropdown.selectEl.empty();

        if (audioInputs.length === 0) {
          defaultSourceDropdown.addOption('', t('settingDefaultSourceNone'));
          defaultSourceDropdown.setDisabled(true);
          return;
        }

        let found = false;
        audioInputs.forEach((device, index) => {
          const label = device.label || `Microphone ${index + 1}`;
          defaultSourceDropdown.addOption(device.deviceId, label);
          if (device.deviceId === this.plugin.settings.defaultAudioSourceId) {
            found = true;
          }
        });

        defaultSourceDropdown.setDisabled(false);

        if (found) {
          defaultSourceDropdown.setValue(this.plugin.settings.defaultAudioSourceId);
        } else if (audioInputs.length > 0) {
          const firstId = audioInputs[0].deviceId;
          defaultSourceDropdown.setValue(firstId);
          this.plugin.settings.defaultAudioSourceId = firstId;
          void this.plugin.saveSettings();
        }
      } catch (err) {
        console.error('Speech-to-Text: Erro ao listar dispositivos nas configurações:', err);
        defaultSourceDropdown.selectEl.empty();
        defaultSourceDropdown.addOption('', t('settingDefaultSourceNone'));
        defaultSourceDropdown.setDisabled(true);
      }
    };

    defaultSourceSetting
      .setName(t('settingDefaultSourceName'))
      .setDesc(t('settingDefaultSourceDesc'))
      .addDropdown((dropdown) => {
        defaultSourceDropdown = dropdown;
        dropdown.onChange(async (val) => {
          if (this.plugin.settings.useDefaultAudioSource && val) {
            this.plugin.settings.defaultAudioSourceId = val;
            await this.plugin.saveSettings();
          }
        });
        void populateDefaultSourceDropdown(this.plugin.settings.useDefaultAudioSource);
      });

    new Setting(containerEl)
      .setName(t('settingPresetsName'))
      .setDesc(t('settingPresetsDesc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('custom', t('presetCustom'));
        PROVIDER_PRESETS.forEach((preset) => {
          dropdown.addOption(preset.id, preset.name);
        });
        dropdown.setValue('custom');
        dropdown.onChange(async (value) => {
          const preset = PROVIDER_PRESETS.find((p) => p.id === value);
          if (preset) {
            Object.assign(this.plugin.settings, preset.config);
            await this.plugin.saveSettings();
            new Notice(t('presetAppliedNotice', { name: preset.name }), 4000);
            this.display();
          }
        });
      });

    new Setting(containerEl)
      .setName(t('settingModeName'))
      .setDesc(t('settingModeDesc'))
      .addDropdown((dropdown) =>
        dropdown
          .addOption('http', t('settingModeHttp'))
          .addOption('websocket', t('settingModeWs'))
          .setValue(this.plugin.settings.connectionMode || 'http')
          .onChange(async (value) => {
            this.plugin.settings.connectionMode = value === 'websocket' ? 'websocket' : 'http';
            await this.plugin.saveSettings();
            this.display(); // Redesenha para exibir/ocultar campos específicos
          }),
      );

    if (this.plugin.settings.connectionMode === 'websocket') {
      new Setting(containerEl)
        .setName(t('settingWsEndpointName'))
        .setDesc(t('settingWsEndpointDesc'))
        .addText((text) =>
          text
            .setPlaceholder('wss://api.deepgram.com/v1/listen?model=nova-2')
            .setValue(this.plugin.settings.wsEndpointUrl)
            .onChange(async (value) => {
              this.plugin.settings.wsEndpointUrl = value.trim();
              await this.plugin.saveSettings();
            }),
        );
    } else {
      new Setting(containerEl)
        .setName(t('settingEndpointName'))
        .setDesc(t('settingEndpointDesc'))
        .addText((text) =>
          text
            .setPlaceholder('https://my-api.stt/transcribe')
            .setValue(this.plugin.settings.endpointUrl)
            .onChange(async (value) => {
              this.plugin.settings.endpointUrl = value.trim();
              await this.plugin.saveSettings();
            }),
        );
    }

    const apiKeySetting = new Setting(containerEl)
      .setName(t('settingApiKeyName'))
      .setDesc(t('settingApiKeyDesc'));

    let isPasswordVisible = false;
    let apiKeyInputEl: HTMLInputElement | null = null;

    apiKeySetting.addText((text) => {
      apiKeyInputEl = text.inputEl;
      apiKeyInputEl.type = 'password';
      text
        .setPlaceholder('api-key')
        .setValue(this.plugin.settings.apiKey)
        .onChange(async (value) => {
          this.plugin.settings.apiKey = value.trim();
          await this.plugin.saveSettings();
        });
    });

    apiKeySetting.addExtraButton((button) => {
      button
        .setIcon('eye')
        .setTooltip(t('showApiKey'))
        .onClick(() => {
          isPasswordVisible = !isPasswordVisible;
          if (apiKeyInputEl) {
            apiKeyInputEl.type = isPasswordVisible ? 'text' : 'password';
          }
          button.setIcon(isPasswordVisible ? 'eye-off' : 'eye');
          button.setTooltip(isPasswordVisible ? t('hideApiKey') : t('showApiKey'));
        });
    });

    new Setting(containerEl)
      .setName(t('testSettingName'))
      .setDesc(t('testSettingDesc'))
      .addButton((button) => {
        button
          .setButtonText(t('testButton'))
          .setCta()
          .onClick(async () => {
            button.setDisabled(true);
            button.setButtonText(t('testButtonTesting'));
            try {
              const res = await this.plugin.testEndpointConnection();
              new Notice(res.message, 6000);
            } catch (error: any) {
              const errorMsg = error?.message || String(error);
              new Notice(t('testFailed', { error: errorMsg }), 8000);
            } finally {
              button.setDisabled(false);
              button.setButtonText(t('testButton'));
            }
          });
      });

    new Setting(containerEl)
      .setName(t('settingModelName'))
      .setDesc(t('settingModelDesc'))
      .addText((text) =>
        text
          .setPlaceholder('whisper-large-v3')
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t('settingLanguageName'))
      .setDesc(t('settingLanguageDesc'))
      .addText((text) =>
        text
          .setPlaceholder('pt')
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t('settingFormDataName'))
      .setDesc(t('settingFormDataDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.useFormData).onChange(async (value) => {
          this.plugin.settings.useFormData = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t('settingFileFieldName'))
      .setDesc(t('settingFileFieldDesc'))
      .addText((text) =>
        text
          .setPlaceholder('file')
          .setValue(this.plugin.settings.fileField)
          .onChange(async (value) => {
            this.plugin.settings.fileField = value || 'file';
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t('settingTextFieldName'))
      .setDesc(t('settingTextFieldDesc'))
      .addText((text) =>
        text
          .setPlaceholder('text')
          .setValue(this.plugin.settings.textField)
          .onChange(async (value) => {
            this.plugin.settings.textField = value || 'text';
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t('settingChunkName'))
      .setDesc(t('settingChunkDesc'))
      .addText((text) =>
        text
          .setPlaceholder('4000')
          .setValue(String(this.plugin.settings.chunkMs))
          .onChange(async (value) => {
            const num = Number(value);
            this.plugin.settings.chunkMs = Number.isFinite(num) && num > 500 ? num : 4000;
            await this.plugin.saveSettings();
            this.plugin.applyTuningSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t('settingVadName'))
      .setDesc(t('settingVadDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableVad).onChange(async (value) => {
          this.plugin.settings.enableVad = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t('settingSilenceName'))
      .setDesc(t('settingSilenceDesc'))
      .addText((text) =>
        text
          .setPlaceholder('0.0015')
          .setValue(String(this.plugin.settings.silenceThreshold))
          .onChange(async (value) => {
            const num = Number(value);
            this.plugin.settings.silenceThreshold = Number.isFinite(num) && num >= 0 ? num : 0.0015;
            await this.plugin.saveSettings();
            this.plugin.applyTuningSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t('settingBufferName'))
      .setDesc(t('settingBufferDesc'))
      .addText((text) =>
        text
          .setPlaceholder('12')
          .setValue(String(this.plugin.settings.maxBufferedChunks))
          .onChange(async (value) => {
            const num = Number(value);
            this.plugin.settings.maxBufferedChunks =
              Number.isFinite(num) && num > 0 ? Math.round(num) : 12;
            await this.plugin.saveSettings();
            this.plugin.applyTuningSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t('settingInactivityName'))
      .setDesc(t('settingInactivityDesc'))
      .addText((text) =>
        text
          .setPlaceholder('0')
          .setValue(String(this.plugin.settings.inactivityTimeoutMs / 1000))
          .onChange(async (value) => {
            const numSeconds = Number(value);
            this.plugin.settings.inactivityTimeoutMs =
              Number.isFinite(numSeconds) && numSeconds >= 0 ? Math.round(numSeconds * 1000) : 0;
            await this.plugin.saveSettings();
            this.plugin.applyTuningSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t('settingTimeoutName'))
      .setDesc(t('settingTimeoutDesc'))
      .addText((text) =>
        text
          .setPlaceholder('15000')
          .setValue(String(this.plugin.settings.requestTimeoutMs ?? 15000))
          .onChange(async (value) => {
            const num = Number(value);
            this.plugin.settings.requestTimeoutMs =
              Number.isFinite(num) && num >= 0 ? Math.round(num) : 15000;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t('settingRepeatsName'))
      .setDesc(t('settingRepeatsDesc'))
      .addText((text) =>
        text
          .setPlaceholder('2')
          .setValue(String(this.plugin.settings.maxConsecutiveWordRepeats))
          .onChange(async (value) => {
            const num = Number(value);
            this.plugin.settings.maxConsecutiveWordRepeats =
              Number.isFinite(num) && num >= 1 ? Math.round(num) : 2;
            await this.plugin.saveSettings();
            this.plugin.applyTuningSettings();
          }),
      );
    new Setting(containerEl)
      .setName(t('settingPunctuationName'))
      .setDesc(t('settingPunctuationDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enablePunctuationCommands).onChange(async (value) => {
          this.plugin.settings.enablePunctuationCommands = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t('settingCapitalizeName'))
      .setDesc(t('settingCapitalizeDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoCapitalize).onChange(async (value) => {
          this.plugin.settings.autoCapitalize = value;
          await this.plugin.saveSettings();
        }),
      );
  }
}
