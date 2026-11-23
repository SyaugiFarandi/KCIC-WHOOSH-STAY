import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BedDouble,
  Building2,
  CalendarCheck,
  KeyRound,
  LifeBuoy,
  QrCode,
  Search,
} from 'lucide-react';
import { Card, PageHeader } from '../components/ui';

const faqs = [
  {
    icon: KeyRound,
    question: 'Bagaimana cara masuk ke Whoosh Stay?',
    answer:
      'Autentikasi mengikuti konfigurasi lingkungan: SSO KCIC melalui penyedia identitas resmi pada produksi, atau login email/password bila diaktifkan administrator.',
  },
  {
    icon: Building2,
    question: 'Dormitory apa saja yang tersedia?',
    answer:
      'Portal menampilkan dormitory internal beserta foto interior, fasilitas, dan ketersediaan tempat tidur per tanggal. Data dikelola administrator melalui master data dan impor terverifikasi.',
  },
  {
    icon: BedDouble,
    question: 'Bagaimana alokasi tempat tidur bekerja?',
    answer:
      'Alokasi dilakukan di tingkat tempat tidur dengan rentang tanggal check-in inklusif dan check-out eksklusif. Sistem mencegah dua reservasi aktif pada tempat tidur dan tanggal yang sama.',
  },
  {
    icon: CalendarCheck,
    question: 'Kapan reservasi perlu persetujuan?',
    answer:
      'Reservasi dapat langsung terkonfirmasi atau masuk antrean persetujuan administrator sesuai kebijakan dormitory. Status terbaru selalu tampil di halaman reservasi saya.',
  },
  {
    icon: QrCode,
    question: 'Bagaimana proses check-in?',
    answer:
      'Setelah reservasi terkonfirmasi, terbitkan QR check-in dari detail reservasi lalu tunjukkan kepada petugas front desk saat tiba. QR bersifat sekali pakai dan kedaluwarsa otomatis.',
  },
  {
    icon: LifeBuoy,
    question: 'Bagaimana bila jadwal dinas berubah?',
    answer:
      'Pembatalan mandiri tersedia sampai sehari sebelum check-in. Perubahan tanggal pada reservasi terkonfirmasi diproses melalui front desk agar alokasi tempat tidur tetap konsisten.',
  },
];

const quickLinks = [
  { to: '/crew/search', label: 'Cari kamar', icon: Search },
  { to: '/crew/reservations', label: 'Reservasi saya', icon: CalendarCheck },
  { to: '/crew/check-in', label: 'QR check-in', icon: QrCode },
];

export function CrewHelpPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Bantuan"
        title="Panduan singkat Whoosh Stay"
        description="Jawaban atas pertanyaan umum tentang akun, akomodasi internal, reservasi, dan check-in."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {quickLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="group flex items-center justify-between gap-3 rounded-2xl border border-ink-200/70 bg-white p-4 shadow-[var(--shadow-card)] transition-colors hover:border-brand-200"
          >
            <span className="flex items-center gap-2.5">
              <span className="rounded-xl bg-brand-50 p-2 text-brand-700">
                <link.icon className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-ink-900">{link.label}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-ink-300 transition-colors group-hover:text-brand-600" />
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {faqs.map((faq) => (
          <Card key={faq.question} className="p-5">
            <span className="inline-flex rounded-xl bg-brand-50 p-2 text-brand-700">
              <faq.icon className="h-4 w-4" />
            </span>
            <h2 className="mt-3.5 text-sm font-bold text-ink-950">{faq.question}</h2>
            <p className="mt-1.5 text-xs leading-6 text-ink-500">{faq.answer}</p>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-ink-100 p-2 text-ink-500">
              <LifeBuoy className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-900">Butuh bantuan lebih lanjut?</p>
              <p className="mt-1 max-w-xl text-xs leading-5 text-ink-500">
                Hubungi administrator dormitory melalui kanal komunikasi resmi KCIC. Kanal kontak
                belum ditentukan dalam konfigurasi sistem, sehingga tidak ada alamat fiktif yang
                ditampilkan di sini.
              </p>
            </div>
          </div>
          <Link
            to="/crew/profile"
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800"
          >
            Periksa profil dan akses
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </Card>
    </div>
  );
}
