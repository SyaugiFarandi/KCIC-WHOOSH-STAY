import { env } from '../../../config/env.js';
import { failed, type DeliveryMessage, type DeliveryProvider, type DeliveryResult } from './types.js';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface TelegramConfig {
  token?: string;
  apiBaseUrl: string;
  timeoutMs: number;
}

interface TelegramResponse {
  ok: boolean;
  description?: string;
  result?: { message_id?: number };
}

function configFromEnv(): TelegramConfig {
  return {
    token: env.TELEGRAM_BOT_TOKEN,
    apiBaseUrl: env.TELEGRAM_API_BASE_URL,
    timeoutMs: env.TELEGRAM_TIMEOUT_MS,
  };
}

export class TelegramProvider implements DeliveryProvider {
  readonly channel = 'TELEGRAM' as const;
  readonly mode = 'TELEGRAM';

  private readonly config: TelegramConfig;
  private readonly fetchImpl: FetchLike;

  constructor(options: { config?: TelegramConfig; fetchImpl?: FetchLike } = {}) {
    this.config = options.config ?? configFromEnv();
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  isConfigured(): boolean {
    return Boolean(this.config.token);
  }

  async send(message: DeliveryMessage): Promise<DeliveryResult> {
    if (!this.isConfigured()) {
      return failed(
        'Telegram belum dikonfigurasi. Isi TELEGRAM_BOT_TOKEN untuk mengaktifkan pengiriman.',
      );
    }
    const chatId = message.to.trim();
    if (!chatId) {
      return failed('Chat ID Telegram belum ditautkan untuk pengguna ini.');
    }

    try {
      const response = await this.fetchImpl(
        `${this.config.apiBaseUrl}/bot${this.config.token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `${message.subject}\n\n${message.text}`,
            disable_web_page_preview: true,
          }),
          signal: AbortSignal.timeout(this.config.timeoutMs),
        },
      );
      const payload = (await response.json().catch(() => null)) as TelegramResponse | null;
      if (!response.ok || !payload?.ok) {
        return failed(payload?.description ?? `Telegram API HTTP ${response.status}`);
      }
      const messageId = payload.result?.message_id;
      return {
        status: 'SENT',
        providerMessageId: messageId ? `telegram:${messageId}` : null,
        error: null,
      };
    } catch (error) {
      const name = error instanceof Error ? error.name : 'Error';
      return failed(`Telegram delivery failed (${name})`);
    }
  }
}
