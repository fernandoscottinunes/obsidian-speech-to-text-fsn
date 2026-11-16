import { describe, expect, it } from 'vitest';
import { cleanTranscript, dedupeConsecutiveWords, updateTail } from '../src/text/textCleaner';

describe('textCleaner', () => {
    describe('dedupeConsecutiveWords', () => {
        it('should limit consecutive repeated words based on maxRepeats', () => {
            const input = 'olá olá olá mundo mundo teste';
            const result = dedupeConsecutiveWords(input, 2);
            expect(result).toBe('olá olá mundo mundo teste');

            const result1 = dedupeConsecutiveWords('teste teste teste teste', 1);
            expect(result1).toBe('teste');
        });

        it('should handle empty or whitespace-only strings', () => {
            expect(dedupeConsecutiveWords('')).toBe('');
            expect(dedupeConsecutiveWords('   ')).toBe('');
        });
    });

    describe('cleanTranscript', () => {
        it('should dedupe incoming words when there is no previous tail', () => {
            const result = cleanTranscript('bom dia dia dia', '', 2);
            expect(result).toBe('bom dia dia ');
        });

        it('should eliminate overlap with previous chunk tail', () => {
            const tail = 'nós estamos gravando áudio';
            const incoming = 'gravando áudio com sucesso agora';

            const result = cleanTranscript(incoming, tail, 2);
            expect(result).toBe('com sucesso agora ');
        });

        it('should keep full text if no overlap matches tail', () => {
            const tail = 'frase anterior finalizada';
            const incoming = 'nova frase começando';

            const result = cleanTranscript(incoming, tail, 2);
            expect(result).toBe('nova frase começando ');
        });

        it('should filter out Whisper silence hallucinations', () => {
            expect(cleanTranscript('You. You', 'algum texto anterior')).toBe('');
            expect(cleanTranscript('Thank you for watching.', '')).toBe('');
            expect(cleanTranscript('Subtitles by someone', '')).toBe('');
            expect(cleanTranscript('Obrigado por assistir.', '')).toBe('');
            expect(cleanTranscript('you', '')).toBe('');
        });

        it('should handle repeated or cut border words', () => {
            const tail = 'as aulas são divididas';
            const incoming = 'divididas em duas partes';
            const result = cleanTranscript(incoming, tail, 2);
            expect(result).toBe('em duas partes ');
        });
    });

    describe('updateTail', () => {
        it('should append text and keep only last maxLen characters', () => {
            const tail = updateTail('inicio ', 'fim', 200);
            expect(tail).toBe('inicio fim');

            const longString = 'a'.repeat(250);
            const truncated = updateTail(longString, '123', 200);
            expect(truncated.length).toBe(200);
            expect(truncated.endsWith('123')).toBe(true);
        });
    });
});
