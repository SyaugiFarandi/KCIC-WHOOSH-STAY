import { describe, expect, it, vi } from 'vitest';
import { SmtpEmailProvider, type MailTransport, type SmtpConfig } from './smtp-email.js';

const CONFIG: SmtpConfig = {
  provider: 'smtp',
  host: 'smtp.example.test',
  port: 587,
  secure: false,
  from: 'noreply@example.test',
  replyTo: 'ops@example.test',
  timeoutMs: 5_000,
};

const MESSAGE = {
  to: 'crew@example.test',
  subject: 'Reservasi disetujui',
  text: 'Detail reservasi Anda sudah tersedia.',
};

function transportReturning(messageId?: string): MailTransport {
  return { sendMail: vi.fn(async () => ({ messageId })) };
}

describe('SmtpEmailProvider', () => {
  it('is not configured when the provider remains mock', async () => {
    const transport = transportReturning('unused');
    const provider = new SmtpEmailProvider({
      config: { ...CONFIG, provider: 'mock' },
      transport,
    });

    expect(provider.isConfigured()).toBe(false);
    const result = await provider.send(MESSAGE);
    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/SMTP belum dikonfigurasi/);
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it('is not configured without host or sender', () => {
    expect(new SmtpEmailProvider({ config: { ...CONFIG, host: undefined } }).isConfigured()).toBe(
      false,
    );
    expect(new SmtpEmailProvider({ config: { ...CONFIG, from: undefined } }).isConfigured()).toBe(
      false,
    );
  });

  it('sends through the injected transport and returns the provider message id', async () => {
    const transport = transportReturning('<message-1@example.test>');
    const provider = new SmtpEmailProvider({ config: CONFIG, transport });

    const result = await provider.send(MESSAGE);

    expect(result).toEqual({
      status: 'SENT',
      providerMessageId: '<message-1@example.test>',
      error: null,
    });
    expect(transport.sendMail).toHaveBeenCalledWith({
      from: 'noreply@example.test',
      to: 'crew@example.test',
      subject: 'Reservasi disetujui',
      text: 'Detail reservasi Anda sudah tersedia.',
      replyTo: 'ops@example.test',
    });
  });

  it('returns FAILED and keeps the transport error message when sending fails', async () => {
    const transport: MailTransport = {
      sendMail: vi.fn(async () => {
        throw new Error('Connection refused');
      }),
    };
    const provider = new SmtpEmailProvider({ config: CONFIG, transport });

    const result = await provider.send(MESSAGE);

    expect(result.status).toBe('FAILED');
    expect(result.providerMessageId).toBeNull();
    expect(result.error).toBe('Connection refused');
  });
});
