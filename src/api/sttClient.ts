import { STTSettings, TranslateFn } from '../types';

export function formatHttpError(
    status: number,
    responseText: string,
    t: TranslateFn
): string {
    let extractedMessage = '';
    try {
        const parsed = JSON.parse(responseText);
        if (parsed && typeof parsed === 'object') {
            extractedMessage =
                parsed.error?.message ||
                parsed.message ||
                parsed.detail ||
                (typeof parsed.error === 'string' ? parsed.error : '');
        }
    } catch {
        if (responseText && responseText.length < 150) {
            extractedMessage = responseText.trim();
        }
    }

    if (status === 401 || status === 403) {
        return extractedMessage
            ? `${t('errorAuth', { status: String(status) })} (${extractedMessage})`
            : t('errorAuth', { status: String(status) });
    }
    if (status === 404) {
        return t('errorNotFound');
    }
    if (status === 429) {
        return extractedMessage
            ? `${t('errorRateLimit')} (${extractedMessage})`
            : t('errorRateLimit');
    }
    if (status >= 500) {
        return extractedMessage
            ? `${t('errorServer', { status: String(status) })}: ${extractedMessage}`
            : t('errorServer', { status: String(status) });
    }

    return extractedMessage
        ? `HTTP ${status}: ${extractedMessage}`
        : `HTTP ${status}: ${responseText.slice(0, 150)}`;
}

export async function sendChunk(
    settings: STTSettings,
    blob: Blob,
    mimeTypeUsed: string,
    t: TranslateFn,
    registerController?: (controller: AbortController) => void,
    unregisterController?: (controller: AbortController) => void
): Promise<string | null> {
    if (!settings.endpointUrl) {
        throw new Error(t('sendChunkError'));
    }

    const controller = new AbortController();
    registerController?.(controller);

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isTimedOut = false;
    const timeoutMs = settings.requestTimeoutMs ?? 15000;

    if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
            isTimedOut = true;
            controller.abort();
        }, timeoutMs);
    }

    try {
        const headers: Record<string, string> = {};

        if (!settings.useFormData) {
            headers['Content-Type'] = mimeTypeUsed;
        }
        if (settings.apiKey) {
            headers['Authorization'] = `Bearer ${settings.apiKey}`;
        }

        const body = settings.useFormData
            ? (() => {
                  const form = new FormData();
                  form.append(settings.fileField || 'file', blob, 'audio.wav');
                  if (settings.model) {
                      form.append('model', settings.model);
                  }
                  if (settings.language) {
                      form.append('language', settings.language);
                  }
                  return form;
              })()
            : blob;

        const response = await fetch(settings.endpointUrl, {
            method: 'POST',
            headers,
            body,
            signal: controller.signal,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(formatHttpError(response.status, text, t));
        }

        const contentType = response.headers.get('Content-Type') || '';
        if (contentType.includes('application/json')) {
            const json = await response.json();
            const field = settings.textField || 'text';
            const hasField = json && typeof json === 'object' && field in json;
            const hasFallback = json && typeof json === 'object' && 'transcript' in json;

            if (!hasField && !hasFallback) {
                const keys = Object.keys(json || {}).join(', ') || 'nenhuma chave';
                console.warn(
                    `Speech-to-Text: Campo "${field}" não encontrado no JSON retornado. Chaves disponíveis: ${keys}`
                );
            }

            const result = (json as any)[field] ?? (json as any).transcript ?? '';
            return typeof result === 'string' ? result : JSON.stringify(result);
        }

        return await response.text();
    } catch (error: any) {
        if (isTimedOut) {
            throw new Error(t('timeoutError', { ms: String(timeoutMs) }));
        }
        throw error;
    } finally {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
        unregisterController?.(controller);
    }
}
