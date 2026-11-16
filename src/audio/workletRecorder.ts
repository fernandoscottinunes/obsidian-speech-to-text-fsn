export const PCM_WORKLET_CODE = `
class PCMWorkletProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 4096;
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
    }

    process(inputs) {
        const input = inputs[0];
        if (input && input.length > 0) {
            const channelData = input[0];
            if (channelData) {
                for (let i = 0; i < channelData.length; i++) {
                    this.buffer[this.bufferIndex++] = channelData[i];
                    if (this.bufferIndex >= this.bufferSize) {
                        const copy = new Float32Array(this.buffer);
                        this.port.postMessage(copy);
                        this.bufferIndex = 0;
                    }
                }
            }
        }
        return true;
    }
}
registerProcessor('pcm-worklet-processor', PCMWorkletProcessor);
`;

export interface RecorderNodeSetup {
    processorNode: AudioWorkletNode | ScriptProcessorNode;
    sourceNode: MediaStreamAudioSourceNode;
    isWorklet: boolean;
    cleanup: () => void;
}

export async function setupAudioRecorderNode(
    audioContext: AudioContext,
    stream: MediaStream,
    onAudioSamples: (samples: Float32Array) => void
): Promise<RecorderNodeSetup> {
    const sourceNode = audioContext.createMediaStreamSource(stream);

    // Tenta registrar e usar AudioWorkletNode nativo em thread dedicada
    if (audioContext.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
        try {
            const blob = new Blob([PCM_WORKLET_CODE], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob);

            try {
                await audioContext.audioWorklet.addModule(blobUrl);
            } finally {
                URL.revokeObjectURL(blobUrl);
            }

            const workletNode = new AudioWorkletNode(audioContext, 'pcm-worklet-processor');
            workletNode.port.onmessage = (event: MessageEvent) => {
                if (event.data instanceof Float32Array) {
                    onAudioSamples(event.data);
                }
            };

            sourceNode.connect(workletNode);
            // Conecta ao destination para manter o clock de processamento ativo
            workletNode.connect(audioContext.destination);

            return {
                processorNode: workletNode,
                sourceNode,
                isWorklet: true,
                cleanup: () => {
                    workletNode.port.onmessage = null;
                    workletNode.disconnect();
                    sourceNode.disconnect();
                },
            };
        } catch (workletError) {
            console.warn(
                'Speech-to-Text: Falha ao carregar AudioWorkletNode, aplicando fallback para ScriptProcessorNode:',
                workletError
            );
        }
    }

    // Fallback gracioso para ScriptProcessorNode
    const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
    scriptNode.onaudioprocess = (event: AudioProcessingEvent) => {
        const channelData = event.inputBuffer.getChannelData(0);
        const clone = new Float32Array(channelData.length);
        clone.set(channelData);
        onAudioSamples(clone);
    };

    sourceNode.connect(scriptNode);
    scriptNode.connect(audioContext.destination);

    return {
        processorNode: scriptNode,
        sourceNode,
        isWorklet: false,
        cleanup: () => {
            scriptNode.onaudioprocess = null;
            scriptNode.disconnect();
            sourceNode.disconnect();
        },
    };
}
