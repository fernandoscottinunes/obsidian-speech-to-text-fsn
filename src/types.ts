export interface AudioSource {
    id: string;
    name: string;
}

export interface STTSettings {
    endpointUrl: string;
    apiKey: string;
    useFormData: boolean;
    model: string;
    language: string;
    fileField: string;
    textField: string;
    chunkMs: number;
    silenceThreshold: number;
    maxBufferedChunks: number;
    maxConsecutiveWordRepeats: number;
    uiLanguage: 'en' | 'pt' | 'system';
    inactivityTimeoutMs: number;
    requestTimeoutMs: number;
    enableVad: boolean;
    connectionMode: 'http' | 'websocket';
    wsEndpointUrl: string;
    lastSelectedSourceId: string;
    enablePunctuationCommands: boolean;
    autoCapitalize: boolean;
}

export type UILang = 'en' | 'pt';

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export const DEFAULT_SETTINGS: STTSettings = {
    endpointUrl: '',
    apiKey: '',
    useFormData: true,
    model: '',
    language: '',
    fileField: 'file',
    textField: 'text',
    chunkMs: 4000,
    silenceThreshold: 0.0015,
    maxBufferedChunks: 12,
    maxConsecutiveWordRepeats: 2,
    uiLanguage: 'en',
    inactivityTimeoutMs: 0,
    requestTimeoutMs: 15000,
    enableVad: true,
    connectionMode: 'http',
    wsEndpointUrl: '',
    lastSelectedSourceId: '',
    enablePunctuationCommands: true,
    autoCapitalize: true,
};
