import { describe, expect, it, vi } from 'vitest';
import { TelegramProvider, type FetchLike } from './telegram.js';

const TOKEN = '123456:test-bot-token';
const CONFIG = { token: TOKEN, apiBaseUrl: 'https://telegram.example.test', timeoutMs: 5_000 };
const MESSAGE = {
  to: '987654321',
  subject: 'Reservasi disetujui',
  text: 'Kamar 101 siap digunakan.',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('TelegramProvider', () => {
  it('is not configured without a bot token', async () => {
    const fetchImpl = vi.fn();
    const provider = new TelegramProvider({ config: { ...CONFIG, token: undefined }, fetchImpl });

    expect(provider.isConfigured()).toBe(false);
    const result = await provider.send(MESSAGE);
    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/TELEGRAM_BOT_TOKEN/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails without a chat id instead of calling Telegram', async () => {
    const fetchImpl = vi.fn();
    const provider = new TelegramProvider({ config: CONFIG, fetchImpl });

    const result = await provider.send({ ...MESSAGE, to: '  ' });

    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/Chat ID Telegram/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts to sendMessage and returns the Telegram message id', async () => {
    const fetchImpl: FetchLike = vi.fn(async () =>
      jsonResponse({ ok: true, result: { message_id: 42 } }),
    );
    const provider = new TelegramProvider({ config: CONFIG, fetchImpl });

    const result = await provider.send(MESSAGE);

    expect(result).toEqual({ status: 'SENT', providerMessageId: 'telegram:42', error: null });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`https://telegram.example.test/bot${TOKEN}/sendMessage`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      chat_id: '987654321',
      text: 'Reservasi disetujui\n\nKamar 101 siap digunakan.',
      disable_web_page_preview: true,
    });
  });

  it('returns the Telegram error description on API rejection', async () => {
    const fetchImpl: FetchLike = vi.fn(async () =>
      jsonResponse({ ok: false, description: 'Bad Request: chat not found' }, 400),
    );
    const provider = new TelegramProvider({ config: CONFIG, fetchImpl });

    const result = await provider.send(MESSAGE);

    expect(result.status).toBe('FAILED');
    expect(result.error).toBe('Bad Request: chat not found');
  });

  it('sanitizes network failures without leaking the bot token', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw new TypeError(`fetch failed for bot${TOKEN}`);
    });
    const provider = new TelegramProvider({ config: CONFIG, fetchImpl });

    const result = await provider.send(MESSAGE);

    expect(result.status).toBe('FAILED');
    expect(result.error).toBe('Telegram delivery failed (TypeError)');
    expect(result.error).not.toContain(TOKEN);
  });
});
