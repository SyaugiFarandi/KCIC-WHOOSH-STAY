import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex min-h-screen items-center justify-center bg-sand-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-ink-100 bg-white p-6 shadow-[var(--shadow-card)]">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">WHOOSH STAY</p>
          <h1 className="mt-2 text-lg font-bold text-ink-950">Halaman gagal dimuat</h1>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            Terjadi kesalahan tak terduga pada antarmuka. Muat ulang halaman; bila masalah berlanjut,
            hubungi administrator.
          </p>
          <div className="mt-5 flex gap-2">
            <Button onClick={() => window.location.reload()}>Muat ulang</Button>
            <Button variant="secondary" onClick={() => window.location.assign('/')}>
              Kembali ke beranda
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
