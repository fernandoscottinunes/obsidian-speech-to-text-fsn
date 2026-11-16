import { describe, expect, it } from 'vitest';
import { formatHttpError } from '../src/api/sttClient';
import { translate } from '../src/i18n/translations';

describe('formatHttpError', () => {
    const t = (key: string, vars?: Record<string, string | number>) => translate('pt', key, vars);
    const tEn = (key: string, vars?: Record<string, string | number>) => translate('en', key, vars);

    it('should format 401 and 403 errors with clear auth guidance', () => {
        const jsonError = JSON.stringify({ error: { message: 'Incorrect API key provided' } });
        const result = formatHttpError(401, jsonError, t);

        expect(result).toContain('Chave de API inválida');
        expect(result).toContain('Incorrect API key provided');

        const resultEn = formatHttpError(403, jsonError, tEn);
        expect(resultEn).toContain('Invalid API Key');
    });

    it('should format 404 error with endpoint not found guidance', () => {
        const result = formatHttpError(404, 'Not Found', t);
        expect(result).toBe('Endpoint STT não encontrado (HTTP 404). Verifique a URL configurada.');
    });

    it('should format 429 rate limit error', () => {
        const jsonError = JSON.stringify({ message: 'Quota exceeded' });
        const result = formatHttpError(429, jsonError, t);
        expect(result).toContain('Limite de requisições ou créditos esgotados');
        expect(result).toContain('Quota exceeded');
    });

    it('should format 500+ server error', () => {
        const jsonError = JSON.stringify({ detail: 'Internal model crash' });
        const result = formatHttpError(500, jsonError, t);
        expect(result).toContain('Servidor STT temporariamente indisponível');
        expect(result).toContain('Internal model crash');
    });
});
