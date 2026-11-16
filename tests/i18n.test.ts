import { describe, expect, it } from 'vitest';
import { translate } from '../src/i18n/translations';

describe('i18n translations', () => {
    it('should interpolate variables accurately in Portuguese and English', () => {
        const pt = translate('pt', 'startNotice', { source: 'Microfone USB' });
        expect(pt).toBe('Iniciando transcrição da fonte: Microfone USB');

        const en = translate('en', 'startNotice', { source: 'USB Mic' });
        expect(en).toBe('Starting transcription from: USB Mic');
    });

    it('should fallback to English when a key is missing in other languages', () => {
        const res = translate('pt', 'someNonExistentKey');
        expect(res).toBe('someNonExistentKey');
    });
});
