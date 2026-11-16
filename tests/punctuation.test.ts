import { describe, expect, it } from 'vitest';
import {
    applyVoicePunctuation,
    autoCapitalizeSentences,
    formatSmartPunctuation,
} from '../src/text/punctuationFormatter';

describe('punctuationFormatter', () => {
    describe('applyVoicePunctuation', () => {
        it('should replace Portuguese punctuation spoken commands', () => {
            const input = 'olá vírgula como você está ponto de interrogação estou bem ponto final';
            const output = applyVoicePunctuation(input, 'pt');
            expect(output).toBe('olá, como você está? estou bem.');
        });

        it('should replace English punctuation spoken commands', () => {
            const input = 'hello comma how are you question mark i am good period new line next line';
            const output = applyVoicePunctuation(input, 'en');
            expect(output).toBe('hello, how are you? i am good.\nnext line');
        });

        it('should clean up leading spaces before punctuation marks', () => {
            const input = 'teste   , outro teste   . final';
            const output = applyVoicePunctuation(input, 'pt');
            expect(output).toBe('teste, outro teste. final');
        });
    });

    describe('autoCapitalizeSentences', () => {
        it('should capitalize beginning of string and after sentence terminators', () => {
            const input = 'este é um teste. aqui começa outra frase? com certeza! mais uma.';
            const output = autoCapitalizeSentences(input);
            expect(output).toBe('Este é um teste. Aqui começa outra frase? Com certeza! Mais uma.');
        });

        it('should capitalize after new lines', () => {
            const input = 'linha um\nlinha dois\noutra linha';
            const output = autoCapitalizeSentences(input);
            expect(output).toBe('Linha um\nLinha dois\nOutra linha');
        });

        it('should not capitalize first character if isStartOfSentence is false', () => {
            const input = 'estão organizadas aqui';
            const output = autoCapitalizeSentences(input, false);
            expect(output).toBe('estão organizadas aqui');
        });
    });

    describe('formatSmartPunctuation combined', () => {
        it('should format commands and capitalize in a single pipeline', () => {
            const input = 'olá vírgula mundo ponto final nova linha tudo certo ponto de interrogação';
            const output = formatSmartPunctuation(input, { enableCommands: true, autoCapitalize: true, lang: 'pt' });
            expect(output).toBe('Olá, mundo.\nTudo certo?');
        });

        it('should preserve mid-sentence lowercase when isStartOfSentence is false', () => {
            const input = 'estão organizadas ponto final nova frase';
            const output = formatSmartPunctuation(input, {
                enableCommands: true,
                autoCapitalize: true,
                lang: 'pt',
                isStartOfSentence: false,
            });
            expect(output).toBe('estão organizadas. Nova frase');
        });
    });
});
