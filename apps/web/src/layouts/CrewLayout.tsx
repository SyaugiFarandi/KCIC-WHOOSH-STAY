import { useState, Suspense, type CSSProperties } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Bell,
  CalendarCheck2,
  CalendarRange,
  Compass,
  DoorOpen,
  History,
  Home,
  LifeBuoy,
  Menu,
  QrCode,
  Search,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../components/Logo';
import { Badge, Button, SkipLink, cn } from '../components/ui';
import { NotificationBell } from '../components/NotificationBell';
import { PageLoading } from '../components/PageLoading';
import {
  AppSidebar,
  useSidebarCollapsed,
  type SidebarGroup,
  type SidebarItem,
} from '../components/Sidebar';
import { initials } from '../lib/format';

const groups: SidebarGroup[] = [
  {
    key: 'explore',
    label: 'Jelajah',
    icon: Compass,
    items: [
      { to: '/crew', label: 'Beranda', icon: Home, end: true },
      { to: '/crew/search', label: 'Cari Kamar', icon: Search },
    ],
  },
  {
    key: 'journey',
    label: 'Perjalanan',
    icon: CalendarCheck2,
    items: [
      { to: '/crew/reservations', label: 'Reservasi', icon: CalendarCheck2 },
      { to: '/crew/check-in', label: 'Check-in', icon: QrCode },
      { to: '/crew/check-out', label: 'Check-out', icon: DoorOpen },
      { to: '/crew/schedule', label: 'Jadwal Menginap', icon: CalendarRange },
      { to: '/crew/history', label: 'Riwayat Menginap', icon: History },
    ],
  },
];

const accountItems: SidebarItem[] = [
  { to: '/crew/notifications', label: 'Notifikasi', icon: Bell },
  { to: '/crew/profile', label: 'Profil Saya', icon: UserRound },
  { to: '/crew/help', label: 'Bantuan', icon: LifeBuoy },
];

const bottomNav = [
  { to: '/crew', label: 'Beranda', icon: Home, end: true },
  { to: '/crew/search', label: 'Cari', icon: Search, end: false },
  { to: '/crew/reservations', label: 'Reservasi', icon: CalendarCheck2, end: false },
  { to: '/crew/check-in', label: 'Check-in', icon: QrCode, end: false },
  { to: '/crew/notifications', label: 'Notifikasi', icon: Bell, end: false },
];

export function CrewLayout() {
  const { me, logout, isLoggingOut } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed('whoosh:sidebar:crew');

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div
      className="min-h-screen bg-sand-50"
      style={{ '--sidebar-w': collapsed ? '76px' : '276px' } as CSSProperties}
    >
      <SkipLink target="crew-main" />

      <AppSidebar
        ariaLabel="Navigasi portal kru"
        homeTo="/crew"
        groups={groups}
        accountItems={accountItems}
        collapsed={collapsed}
        onToggleCollapsed={toggle}
        mobileOpen={sidebarOpen}
        onCloseMobile={closeSidebar}
        userName={me?.user.displayName}
        userEmail={me?.user.email}
        userInitials={initials(me?.user.displayName ?? 'WS')}
        onLogout={handleLogout}
        isLoggingOut={isLoggingOut}
        badge={
          <Badge tone="brand" className="border-white/15 bg-white/10 text-white/80">
            {me?.session.authMode === 'mock' ? 'Portal Kru · DEMO' : 'Portal Kru'}
          </Badge>
        }
        footerNote={
          <div className="rounded-2xl border border-white/15 bg-black/10 p-3.5">
            <p className="text-[11px] font-semibold text-white/80">Akomodasi internal</p>
            <p className="mt-1 text-[11px] leading-5 text-white/50">
              {me?.session.authMode === 'mock'
                ? 'Seluruh nama, foto, dan lokasi dormitory pada lingkungan DEMO merupakan ilustrasi sintetis.'
                : 'Data dormitory dikelola administrator melalui master data dan impor terverifikasi.'}
            </p>
          </div>
        }
      />

      <div className="transition-[padding] duration-[260ms] ease-out lg:pl-[var(--sidebar-w)]">
        <header
          role="banner"
          className="sticky top-0 z-30 border-b border-sand-200/80 bg-sand-50/90 backdrop-blur"
        >
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                className="h-9 w-9 p-0 lg:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Buka navigasi"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <Link to="/crew" className="lg:hidden" aria-label="Whoosh Stay">
                <Logo />
              </Link>
              <div className="hidden items-center gap-2 text-xs font-medium text-ink-400 sm:flex">
                <span>Portal Kru</span>
                <span aria-hidden className="h-1 w-1 rounded-full bg-ink-300" />
                <span className="truncate text-ink-700">
                  {me?.user.employeeName ?? me?.user.displayName}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell scope="crew" allHref="/crew/notifications" />
              <Link
                to="/crew/profile"
                className="flex items-center gap-2.5 rounded-full border border-sand-200 bg-white/80 py-1 pl-1 pr-3 transition-colors hover:border-brand-200"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-700 text-[10px] font-bold text-white">
                  {initials(me?.user.displayName ?? 'WS')}
                </span>
                <span className="hidden leading-tight sm:block">
                  <span className="block max-w-[140px] truncate text-[11px] font-semibold text-ink-800">
                    {me?.user.displayName}
                  </span>
                  <span className="block text-[9px] font-medium text-ink-400">Kru</span>
                </span>
              </Link>
            </div>
          </div>
        </header>

        <main
          id="crew-main"
          className="mx-auto w-full max-w-[1320px] px-4 pb-28 pt-7 sm:px-6 md:pb-12 lg:pb-16"
        >
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-sand-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden"
        aria-label="Navigasi bawah portal kru"
      >
        <div className="mx-auto flex max-w-md items-center justify-around">
          {bottomNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors',
                  isActive ? 'text-brand-700' : 'text-ink-400',
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
