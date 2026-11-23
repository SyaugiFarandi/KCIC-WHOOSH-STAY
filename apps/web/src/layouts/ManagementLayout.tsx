import { useState, Suspense, type CSSProperties } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BedDouble,
  Building2,
  CalendarCheck2,
  ChevronRight,
  ClipboardList,
  ConciergeBell,
  Database,
  FileBarChart2,
  Gauge,
  LayoutDashboard,
  Menu,
  Scale,
  ShieldCheck,
  Sparkles,
  UserRound,
  CalendarDays,
  CalendarRange,
  Images,
  Telescope,
  Wrench,
} from 'lucide-react';
import { ROLE_LABELS, type PermissionCode } from '@whoosh/shared';
import { useAuth } from '../auth/AuthProvider';
import { Badge, Button, SkipLink, cn } from '../components/ui';
import { NotificationBell } from '../components/NotificationBell';
import { PageLoading } from '../components/PageLoading';
import {
  AppSidebar,
  useSidebarCollapsed,
  type SidebarChild,
  type SidebarGroup,
  type SidebarItem,
} from '../components/Sidebar';
import { initials } from '../lib/format';

interface NavChild extends SidebarChild {
  permission?: PermissionCode;
}

interface NavItem extends SidebarItem {
  permission?: PermissionCode;
  children?: NavChild[];
}

interface NavSection {
  key: string;
  label: string;
  icon: SidebarGroup['icon'];
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    key: 'summary',
    label: 'Utama',
    icon: LayoutDashboard,
    items: [{ to: '/manage/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    key: 'reservations',
    label: 'Reservasi',
    icon: CalendarCheck2,
    items: [
      {
        to: '/manage/reservations',
        label: 'Manajemen Reservasi',
        icon: CalendarCheck2,
        permission: 'reservations.read',
      },
      {
        to: '/manage/availability',
        label: 'Ketersediaan',
        icon: CalendarRange,
        permission: 'availability.read',
      },
      {
        to: '/manage/calendar',
        label: 'Kalender Hunian',
        icon: CalendarDays,
        permission: 'reservations.read',
      },
      {
        to: '/manage/occupancy',
        label: 'Inteligensi Hunian',
        icon: Gauge,
        permission: 'occupancy.read',
      },
      {
        to: '/manage/front-desk',
        label: 'Front Desk & Check-in',
        icon: ConciergeBell,
        permission: 'stays.read',
      },
    ],
  },
  {
    key: 'operations',
    label: 'Operasional',
    icon: ConciergeBell,
    items: [
      {
        to: '/manage/exceptions',
        label: 'Pusat Eksepsi',
        icon: AlertTriangle,
        permission: 'exceptions.read',
      },
      {
        to: '/manage/housekeeping',
        label: 'Housekeeping',
        icon: Sparkles,
        permission: 'housekeeping.read',
      },
      {
        to: '/manage/maintenance',
        label: 'Maintenance',
        icon: Wrench,
        permission: 'maintenance.read',
      },
      {
        to: '/manage/roster',
        label: 'Manajemen Crew',
        icon: ClipboardList,
        permission: 'roster.read',
      },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventaris',
    icon: Building2,
    items: [
      {
        to: '/manage/inventory',
        label: 'Dormitory & Kamar',
        icon: Building2,
        permission: 'rooms.read',
      },
      {
        to: '/manage/gallery',
        label: 'Galeri Foto',
        icon: Images,
        permission: 'photos.manage',
      },
      {
        to: '/manage/research',
        label: 'Riset Akomodasi',
        icon: Telescope,
        permission: 'research.read',
      },
    ],
  },
  {
    key: 'reports',
    label: 'Laporan',
    icon: FileBarChart2,
    items: [
      {
        to: '/manage/reports',
        label: 'Laporan',
        icon: FileBarChart2,
        permission: 'reports.read',
        children: [
          {
            to: '/manage/reports?tab=reservations',
            label: 'Laporan Reservasi',
            icon: FileBarChart2,
            permission: 'reports.read',
          },
          {
            to: '/manage/reports?tab=occupancy',
            label: 'Laporan Hunian',
            icon: BedDouble,
            permission: 'reports.read',
          },
          {
            to: '/manage/reports?tab=operational',
            label: 'Laporan Operasional',
            icon: Activity,
            permission: 'reports.read',
          },
        ],
      },
    ],
  },
  {
    key: 'admin',
    label: 'Pengelolaan Sistem',
    icon: ShieldCheck,
    items: [
      {
        to: '/manage/master-data',
        label: 'Master Data',
        icon: Database,
        permission: 'dormitories.read',
      },
      {
        to: '/manage/policies',
        label: 'Kebijakan Akomodasi',
        icon: Scale,
        permission: 'policies.read',
      },
      {
        to: '/manage/users',
        label: 'Pengguna & Hak Akses',
        icon: ShieldCheck,
        permission: 'users.read',
      },
    ],
  },
];

const accountItems: SidebarItem[] = [
  { to: '/manage/profile', label: 'Profil Saya', icon: UserRound },
];

export function ManagementLayout() {
  const { me, logout, isLoggingOut, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapsed('whoosh:sidebar:management');

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const closeSidebar = () => setSidebarOpen(false);

  const visibleGroups: SidebarGroup[] = navSections
    .map((section) => ({
      key: section.key,
      label: section.label,
      icon: section.icon,
      collapsible:
        section.items.length > 1 || Boolean(section.items[0]?.children?.length),
      items: section.items
        .map((item) => ({
          ...item,
          children: item.children?.filter(
            (child) => !child.permission || hasPermission(child.permission),
          ),
        }))
        .filter((item) => {
          if (item.permission && !hasPermission(item.permission)) return false;
          return item.children ? item.children.length > 0 : true;
        }),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div
      className="min-h-screen bg-page"
      style={{ '--sidebar-w': collapsed ? '76px' : '276px' } as CSSProperties}
    >
      <SkipLink target="management-main" />

      <AppSidebar
        ariaLabel="Navigasi management"
        homeTo="/manage/dashboard"
        groups={visibleGroups}
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
          <div className="flex flex-wrap gap-1.5">
            {me?.session.authMode === 'mock' ? (
              <Badge tone="brand" className="border-white/15 bg-white/10 text-white/80">
                DEMO DATA
              </Badge>
            ) : null}
            <Badge tone="neutral" className="border-white/15 bg-white/5 text-white/75">
              {me?.session.authMode === 'mock'
                ? 'Demo auth'
                : me?.session.authMode === 'password'
                  ? 'Login email'
                  : 'SSO aktif'}
            </Badge>
          </div>
        }
        footerNote={
          <div className={cn('rounded-2xl border border-white/15 bg-black/10 p-3.5')}>
            {me?.session.authMode === 'mock' ? (
              <>
                <p className="text-[11px] font-semibold text-white/80">Lingkungan DEMO</p>
                <p className="mt-1 text-[11px] leading-5 text-white/70">
                  Data pada lingkungan ini adalah DEMO DATA / SIMULATED DATA. Integrasi KCIC
                  berjalan melalui adapter mock.
                </p>
              </>
            ) : (
              <>
                <p className="text-[11px] font-semibold text-white/80">Data operasional</p>
                <p className="mt-1 text-[11px] leading-5 text-white/70">
                  Perubahan tercatat pada audit log. Integrasi mengikuti konfigurasi lingkungan.
                </p>
              </>
            )}
          </div>
        }
      />

      <div className="transition-[padding] duration-[260ms] ease-out lg:pl-[var(--sidebar-w)]">
        <header className="sticky top-0 z-30 border-b border-ink-200/70 bg-page/90 backdrop-blur">
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
              <div className="hidden items-center gap-2 text-xs font-medium text-ink-400 sm:flex">
                <span>Management Portal</span>
                <ChevronRight className="h-3 w-3" />
                <span className="truncate text-ink-700">
                  {me?.roles.map((role) => ROLE_LABELS[role.roleCode] ?? role.roleCode).join(' · ')}
                </span>
              </div>
              <span className="truncate text-sm font-semibold text-ink-800 sm:hidden">
                Management Portal
              </span>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell scope="management" />
              <Link
                to="/manage/profile"
                className="hidden items-center gap-2 rounded-full border border-ink-200 bg-white/80 py-1 pl-1 pr-3 text-left transition-colors hover:border-brand-200 md:flex"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-700 text-[10px] font-bold text-white">
                  {initials(me?.user.displayName ?? 'WS')}
                </span>
                <span className="leading-tight">
                  <span className="block max-w-[140px] truncate text-[11px] font-semibold text-ink-800">
                    {me?.user.displayName}
                  </span>
                  <span className="block text-[9px] font-medium uppercase tracking-wide text-ink-400">
                    Management
                  </span>
                </span>
              </Link>
              <Badge tone={me?.session.authMode === 'mock' ? 'warning' : 'success'}>
                {me?.session.authMode === 'mock'
                  ? 'Demo auth'
                  : me?.session.authMode === 'password'
                    ? 'Login email'
                    : 'SSO aktif'}
              </Badge>
            </div>
          </div>
        </header>

        <main
          id="management-main"
          className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 min-[1800px]:max-w-[1760px]"
        >
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
