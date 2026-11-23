import { SmtpEmailProvider } from './smtp-email.js';
import { TelegramProvider } from './telegram.js';
import type { DeliveryChannel, DeliveryProvider } from './types.js';

const providers: Record<DeliveryChannel, DeliveryProvider> = {
  EMAIL: new SmtpEmailProvider(),
  TELEGRAM: new TelegramProvider(),
};

export function getDeliveryProvider(channel: DeliveryChannel): DeliveryProvider | null {
  const provider = providers[channel];
  return provider.isConfigured() ? provider : null;
}

export function deliveryModeLabel(): string {
  const email = providers.EMAIL.isConfigured() ? providers.EMAIL.mode : 'MOCK';
  const telegram = providers.TELEGRAM.isConfigured() ? providers.TELEGRAM.mode : 'MOCK';
  if (email === 'MOCK' && telegram === 'MOCK') return 'MOCK';
  return `EMAIL:${email}/TELEGRAM:${telegram}`;
}

export { SmtpEmailProvider, TelegramProvider };
export type { DeliveryChannel, DeliveryProvider, DeliveryResult } from './types.js';
