import nodemailer from 'nodemailer';
import { env } from '../../../config/env.js';
import { failed, type DeliveryMessage, type DeliveryProvider, type DeliveryResult } from './types.js';

export interface MailTransport {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    text: string;
    replyTo?: string;
  }): Promise<{ messageId?: string }>;
}

export interface SmtpConfig {
  provider: 'mock' | 'smtp';
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from?: string;
  replyTo?: string;
  timeoutMs: number;
}

function configFromEnv(): SmtpConfig {
  return {
    provider: env.EMAIL_PROVIDER,
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from: env.SMTP_FROM,
    replyTo: env.SMTP_REPLY_TO,
    timeoutMs: env.SMTP_TIMEOUT_MS,
  };
}

function createTransport(config: SmtpConfig): MailTransport {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
    connectionTimeout: config.timeoutMs,
    greetingTimeout: config.timeoutMs,
    socketTimeout: config.timeoutMs,
  }) as unknown as MailTransport;
}

export class SmtpEmailProvider implements DeliveryProvider {
  readonly channel = 'EMAIL' as const;
  readonly mode = 'SMTP';

  private transport: MailTransport | null;
  private readonly config: SmtpConfig;

  constructor(options: { transport?: MailTransport; config?: SmtpConfig } = {}) {
    this.config = options.config ?? configFromEnv();
    this.transport = options.transport ?? null;
  }

  isConfigured(): boolean {
    return this.config.provider === 'smtp' && Boolean(this.config.host) && Boolean(this.config.from);
  }

  async send(message: DeliveryMessage): Promise<DeliveryResult> {
    if (!this.isConfigured()) {
      return failed(
        'SMTP belum dikonfigurasi. Isi EMAIL_PROVIDER=smtp, SMTP_HOST, SMTP_FROM dan kredensial lainnya.',
      );
    }
    try {
      this.transport ??= createTransport(this.config);
      const info = await this.transport.sendMail({
        from: this.config.from!,
        to: message.to,
        subject: message.subject,
        text: message.text,
        replyTo: this.config.replyTo,
      });
      return {
        status: 'SENT',
        providerMessageId: info.messageId ?? null,
        error: null,
      };
    } catch (error) {
      return failed(error instanceof Error ? error.message : 'SMTP delivery failed');
    }
  }
}
