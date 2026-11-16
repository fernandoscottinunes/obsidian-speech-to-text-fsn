// Alucinações conhecidas e padrões comuns gerados pelo Whisper em trechos de silêncio ou ruído
const WHISPER_HALLUCINATIONS = [
    /^(you(\s*|\.|\?|!|,|-)*)+$/i,
    /^(thank\s*you(\s*for\s*watching)?(\s*|\.|\?|!|,|-)*)+$/i,
    /^(obrigado(\s*por\s*assistir)?(\s*|\.|\?|!|,|-)*)+$/i,
    /^(subtitles\s*by\s*.*)$/i,
    /^(legenda[s]?\s*(pela|pela comunidade|por)\s*.*)$/i,
    /^(subscribe(\s*|\.|\?|!|,|-)*)+$/i,
    /^(inscreva-se(\s*|\.|\?|!|,|-)*)+$/i,
    /^(bye|goodbye|tchau)(\s*|\.|\?|!|,|-)*$/i,
    /^([.,;:?!-]\s*)+$/,
];

export function isHallucination(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return true;
    for (const pattern of WHISPER_HALLUCINATIONS) {
        if (pattern.test(trimmed)) {
            return true;
        }
    }
    return false;
}

export function dedupeConsecutiveWords(text: string, maxRepeats = 2): string {
    if (!text) return text;

    const tokens = text.split(/(\s+)/);
    const output: string[] = [];
    let lastWord = '';
    let repeatCount = 0;

    const normalize = (token: string) => token.toLowerCase().replace(/[^a-z0-9\u00c0-\u017f]+/gi, '');

    for (const token of tokens) {
        if (/^\s+$/.test(token)) {
            output.push(token);
            continue;
        }

        const normalized = normalize(token);
        if (normalized && normalized === lastWord) {
            repeatCount += 1;
            if (repeatCount >= maxRepeats) {
                continue;
            }
        } else {
            lastWord = normalized;
            repeatCount = 0;
        }

        output.push(token);
    }

    return output.join('').replace(/\s+/g, ' ').trim();
}

export function cleanTranscript(
    incoming: string,
    previousTail: string,
    maxConsecutiveWordRepeats = 2
): string {
    if (!incoming) return incoming;

    if (isHallucination(incoming)) {
        return '';
    }

    const normalizedIncoming = incoming.trimStart();
    let result = '';
    if (!previousTail) {
        result = dedupeConsecutiveWords(normalizedIncoming, maxConsecutiveWordRepeats);
    } else {
        const cleanPrev = previousTail.replace(/[,.:;?!]+$/g, '').trim();
        const prevWords = cleanPrev.split(/\s+/);
        const nextWords = normalizedIncoming.split(/\s+/);

        const cleanToken = (w: string) => w.toLowerCase().replace(/[^a-z0-9\u00c0-\u017f]/gi, '');

        const maxOverlap = Math.min(6, prevWords.length, nextWords.length);
        let found = false;

        for (let overlap = maxOverlap; overlap > 0; overlap--) {
            const tailPhrase = prevWords.slice(-overlap).map(cleanToken).join(' ');
            const headPhrase = nextWords.slice(0, overlap).map(cleanToken).join(' ');
            if (tailPhrase && tailPhrase === headPhrase) {
                const remainder = nextWords.slice(overlap).join(' ');
                result = dedupeConsecutiveWords(remainder, maxConsecutiveWordRepeats);
                found = true;
                break;
            }
        }

        // Se não houve sobreposição exata de palavras completas, verifica se a primeira palavra
        // do novo chunk completa ou duplica uma palavra parcial final do chunk anterior
        if (!found && prevWords.length > 0 && nextWords.length > 0) {
            const lastPrevWord = cleanToken(prevWords[prevWords.length - 1]);
            const firstNextWord = cleanToken(nextWords[0]);

            if (lastPrevWord && firstNextWord) {
                // Caso 1: A primeira palavra é idêntica à última palavra anterior (duplicada pelo corte)
                if (lastPrevWord === firstNextWord) {
                    const remainder = nextWords.slice(1).join(' ');
                    result = dedupeConsecutiveWords(remainder, maxConsecutiveWordRepeats);
                    found = true;
                }
                // Caso 2: A última palavra anterior era um prefixo da primeira palavra (cortada pela metade, ex: "divi" -> "divididas")
                else if (firstNextWord.startsWith(lastPrevWord) && lastPrevWord.length >= 3) {
                    const remainder = nextWords.slice(1).join(' ');
                    result = dedupeConsecutiveWords(remainder, maxConsecutiveWordRepeats);
                    found = true;
                }
            }
        }

        if (!found) {
            result = dedupeConsecutiveWords(normalizedIncoming, maxConsecutiveWordRepeats);
        }
    }

    if (isHallucination(result)) {
        return '';
    }

    return result ? result + ' ' : result;
}

export function updateTail(previousTail: string, appended: string, maxLen = 200): string {
    const combined = previousTail + appended;
    return combined.slice(-maxLen);
}
