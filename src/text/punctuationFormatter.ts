export function applyVoicePunctuation(text: string, lang = 'pt'): string {
    if (!text) return text;

    let res = text;

    // Regras em Português (ordenadas das mais específicas/longas para as mais curtas)
    if (lang === 'pt' || lang === 'system') {
        res = res
            .replace(/\b(ponto de interrogação)\b/gi, '?')
            .replace(/\b(ponto de exclamação)\b/gi, '!')
            .replace(/\b(ponto e vírgula)\b/gi, ';')
            .replace(/\b(dois pontos)\b/gi, ':')
            .replace(/\b(ponto final)\b/gi, '.')
            .replace(/\b(interrogação)\b/gi, '?')
            .replace(/\b(exclamação)\b/gi, '!')
            .replace(/\b(vírgula)\b/gi, ',')
            .replace(/\b(ponto)\b/gi, '.')
            .replace(/\s*\b(nova linha|novo parágrafo|pular linha)\b\s*/gi, '\n');
    }

    // Regras em Inglês
    res = res
        .replace(/\b(question mark)\b/gi, '?')
        .replace(/\b(exclamation mark|exclamation point)\b/gi, '!')
        .replace(/\b(semicolon)\b/gi, ';')
        .replace(/\b(full stop)\b/gi, '.')
        .replace(/\b(period)\b/gi, '.')
        .replace(/\b(comma)\b/gi, ',')
        .replace(/\b(colon)\b/gi, ':')
        .replace(/\s*\b(new line|new paragraph)\b\s*/gi, '\n');

    // Remove espaços antes de pontuação (ex: "olá , mundo" -> "olá, mundo")
    res = res.replace(/\s+([,.:;?!])/g, '$1');

    return res;
}

export function autoCapitalizeSentences(text: string, isStartOfSentence = true): string {
    if (!text) return text;

    let res = text;
    if (isStartOfSentence) {
        // Capitaliza primeiro caractere não-espaço se for início de frase
        res = res.replace(/^(\s*)([a-z\u00c0-\u017f])/i, (_, space, char) => `${space}${char.toUpperCase()}`);
    }

    // Capitaliza caracteres após pontuação final (. ? ! ou \n) seguido de espaço
    res = res.replace(/([.?!]\s+|\n+\s*)([a-z\u00c0-\u017f])/gi, (_, punct, char) => `${punct}${char.toUpperCase()}`);

    return res;
}

export function formatSmartPunctuation(
    text: string,
    options: {
        enableCommands?: boolean;
        autoCapitalize?: boolean;
        lang?: string;
        isStartOfSentence?: boolean;
    } = {}
): string {
    let result = text;

    if (options.enableCommands !== false) {
        result = applyVoicePunctuation(result, options.lang || 'pt');
    }

    if (options.autoCapitalize !== false) {
        result = autoCapitalizeSentences(result, options.isStartOfSentence ?? true);
    }

    return result;
}
