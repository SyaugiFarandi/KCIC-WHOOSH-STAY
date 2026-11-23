export type DeliveryChannel = 'EMAIL' | 'TELEGRAM';

export interface DeliveryMessage {
  to: string;
  subject: string;
  text: string;
}

export interface DeliveryResult {
  status: 'SENT' | 'FAILED';
  providerMessageId: string | null;
  error: string | null;
}

export interface DeliveryProvider {
  readonly channel: DeliveryChannel;
  readonly mode: string;
  isConfigured(): boolean;
  send(message: DeliveryMessage): Promise<DeliveryResult>;
}

export function failed(error: string): DeliveryResult {
  return { status: 'FAILED', providerMessageId: null, error: error.slice(0, 500) };
}
