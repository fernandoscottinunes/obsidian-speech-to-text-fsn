import { STTSettings } from '../types';

export interface ProviderPreset {
    id: string;
    name: string;
    description: string;
    config: Partial<STTSettings>;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
    {
        id: 'openai',
        name: 'OpenAI (Whisper API)',
        description: 'Endpoint oficial da OpenAI (whisper-1). Envia áudio multipart.',
        config: {
            connectionMode: 'http',
            endpointUrl: 'https://api.openai.com/v1/audio/transcriptions',
            model: 'whisper-1',
            useFormData: true,
            fileField: 'file',
            textField: 'text',
        },
    },
    {
        id: 'groq',
        name: 'Groq Cloud (Whisper Large V3 - Ultra Rápido)',
        description: 'API gratuita/acessível e de altíssima velocidade da Groq.',
        config: {
            connectionMode: 'http',
            endpointUrl: 'https://api.groq.com/openai/v1/audio/transcriptions',
            model: 'whisper-large-v3',
            useFormData: true,
            fileField: 'file',
            textField: 'text',
        },
    },
    {
        id: 'deepgram',
        name: 'Deepgram (WebSocket Streaming Nova-2)',
        description: 'Streaming em tempo real com baixa latência via WebSocket.',
        config: {
            connectionMode: 'websocket',
            wsEndpointUrl: 'wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true',
            model: 'nova-2',
            textField: 'text',
        },
    },
    {
        id: 'local_whisper',
        name: 'Whisper Local (Faster-Whisper / LocalAI / Whisper.cpp)',
        description: 'Servidor local na sua própria máquina (ex.: localhost:8000).',
        config: {
            connectionMode: 'http',
            endpointUrl: 'http://localhost:8000/v1/audio/transcriptions',
            model: 'Systran/faster-whisper-small',
            useFormData: true,
            fileField: 'file',
            textField: 'text',
            apiKey: '',
        },
    },
];
