import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, Ellipsis, LogOut, X } from 'lucide-react';
import { Logo } from './Logo';
import { cn } from './ui';

export interface SidebarChild {
  to: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  end?: boolean;
}

export interface SidebarItem {
  to?: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
  children?: SidebarChild[];
}

export interface SidebarGroup {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  items: SidebarItem[];
  collapsible?: boolean;
}

interface AppSidebarProps {
  ariaLabel: string;
  homeTo: string;
  groups: SidebarGroup[];
  accountItems: SidebarItem[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  userName?: string;
  userEmail?: string;
  userInitials: string;
  onLogout: () => void;
  isLoggingOut: boolean;
  footerNote?: ReactNode;
  badge?: ReactNode;
}

function readCollapsed(storageKey: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(storageKey) === 'collapsed';
}

function isPathActive(to: string, pathname: string, search: string, end?: boolean): boolean {
  const [targetPath, targetQuery = ''] = to.split('?');
  const pathMatches = pathname === targetPath || (!end && pathname.startsWith(`${targetPath}/`));
  if (!pathMatches) return false;
  if (!targetQuery) return true;
  const current = new URLSearchParams(search);
  return Array.from(new URLSearchParams(targetQuery)).every(
    ([key, value]) => current.get(key) === value,
  );
}

function isItemActive(item: SidebarItem, pathname: string, search: string): boolean {
  if (item.to && isPathActive(item.to, pathname, search, item.end)) return true;
  return (
    item.children?.some((child) => isPathActive(child.to, pathname, search, child.end)) ?? false
  );
}

export function useSidebarCollapsed(storageKey: string) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(storageKey));

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(storageKey, next ? 'collapsed' : 'expanded');
      return next;
    });
  }, [storageKey]);

  return { collapsed, toggle };
}

function SidebarLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: SidebarItem;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  if (!item.to) return null;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group/link relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
          collapsed && 'lg:justify-center lg:px-0',
          isActive
            ? 'bg-white font-semibold text-sidebar shadow-sm'
            : 'text-white/65 hover:bg-white/10 hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden
            className={cn(
              'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gold-400 transition-opacity',
              isActive ? 'opacity-100' : 'opacity-0',
            )}
          />
          <item.icon className="h-4.5 w-4.5 shrink-0" />
          <span className={cn('min-w-0 flex-1 truncate', collapsed && 'lg:hidden')}>
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  );
}

function SidebarChildLink({
  child,
  active,
  onNavigate,
}: {
  child: SidebarChild;
  active: boolean;
  onNavigate: () => void;
}) {
  const ChildIcon = child.icon;
  return (
    <Link
      to={child.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-lg py-2 pl-2.5 pr-2 text-xs transition-colors',
        active
          ? 'bg-white font-semibold text-sidebar shadow-sm'
          : 'font-medium text-white/70 hover:bg-white/10 hover:text-white',
      )}
    >
      {ChildIcon ? (
        <ChildIcon className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <span
          aria-hidden
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full', active ? 'bg-sidebar' : 'bg-white/25')}
        />
      )}
      <span className="min-w-0 truncate">{child.label}</span>
    </Link>
  );
}

function SidebarSubmenu({ item, onNavigate }: { item: SidebarItem; onNavigate: () => void }) {
  const location = useLocation();
  const childActive =
    item.children?.some((child) =>
      isPathActive(child.to, location.pathname, location.search, child.end),
    ) ?? false;
  const [open, setOpen] = useState(childActive);
  const panelId = useId();

  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive, location.pathname, location.search]);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
          childActive
            ? 'bg-white/10 text-white'
            : 'text-white/65 hover:bg-white/10 hover:text-white',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gold-400 transition-opacity',
            childActive ? 'opacity-100' : 'opacity-0',
          )}
        />
        <item.icon className="h-4.5 w-4.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            'h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-180',
            childActive ? 'text-white/80' : 'text-white/50',
          )}
        />
      </button>
      <div
        id={panelId}
        aria-hidden={!open}
        className={cn(
          'ml-[1.35rem] grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div
          className={cn(
            'min-h-0 space-y-1 overflow-hidden border-l border-white/15 pl-2 pt-1',
            !open && 'invisible',
          )}
          inert={!open ? true : undefined}
        >
          {item.children?.map((child) => (
            <SidebarChildLink
              key={child.to}
              child={child}
              active={isPathActive(child.to, location.pathname, location.search, child.end)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CollapsedGroup({
  group,
  active,
  onNavigate,
}: {
  group: SidebarGroup;
  active: boolean;
  onNavigate: () => void;
}) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const flyoutId = useId();

  const show = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor({
      top: Math.min(Math.max(12, rect.top - 12), window.innerHeight - 320),
      left: rect.right + 12,
    });
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="group/flyout relative hidden lg:flex lg:justify-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : show())}
        onMouseEnter={show}
        onFocus={show}
        aria-expanded={open}
        aria-controls={flyoutId}
        aria-label={group.label}
        className={cn(
          'relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
          active ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gold-400 transition-opacity',
            active ? 'opacity-100' : 'opacity-0',
          )}
        />
        <group.icon className="h-4.5 w-4.5" />
      </button>
      <div
        id={flyoutId}
        className={cn(
          'fixed z-[60] max-h-[70vh] w-60 overflow-y-auto rounded-2xl border border-ink-200 bg-white p-2 text-ink-900 shadow-2xl scrollbar-slim',
          open ? 'block' : 'pointer-events-none hidden',
        )}
        style={{ top: anchor?.top ?? 0, left: anchor?.left ?? 0 }}
        role="group"
        aria-label={group.label}
        onMouseLeave={() => setOpen(false)}
      >
        <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">
          {group.label}
        </p>
        {group.items.map((item) => {
          if (item.children?.length) {
            return (
              <div key={item.to ?? item.label} className="pt-1">
                <p className="px-2.5 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">
                  {item.label}
                </p>
                {item.children.map((child) => {
                  const active = isPathActive(
                    child.to,
                    location.pathname,
                    location.search,
                    child.end,
                  );
                  const ChildIcon = child.icon;
                  return (
                    <Link
                      key={child.to}
                      to={child.to}
                      onClick={() => {
                        setOpen(false);
                        onNavigate();
                      }}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs transition-colors',
                        active
                          ? 'bg-brand-50 font-semibold text-brand-800'
                          : 'font-medium text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                      )}
                    >
                      {ChildIcon ? (
                        <ChildIcon className="h-4 w-4 shrink-0" />
                      ) : (
                        <span
                          aria-hidden
                          className={cn(
                            'h-1.5 w-1.5 shrink-0 rounded-full',
                            active ? 'bg-brand-700' : 'bg-ink-300',
                          )}
                        />
                      )}
                      <span className="truncate">{child.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          }
          if (!item.to) return null;
          const active = isPathActive(item.to, location.pathname, location.search, item.end);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => {
                setOpen(false);
                onNavigate();
              }}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs transition-colors',
                active
                  ? 'bg-brand-50 font-semibold text-brand-800'
                  : 'font-medium text-ink-600 hover:bg-ink-50 hover:text-ink-900',
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function groupIsCollapsible(group: SidebarGroup): boolean {
  return group.collapsible ?? (group.items.length > 1 || Boolean(group.items[0]?.children?.length));
}

function SidebarGroupBody({
  group,
  flatChildren,
  onNavigate,
}: {
  group: SidebarGroup;
  flatChildren: SidebarChild[] | null;
  onNavigate: () => void;
}) {
  const location = useLocation();
  return (
    <nav aria-label={group.label} className="space-y-1">
      {flatChildren
        ? flatChildren.map((child) => (
            <SidebarChildLink
              key={child.to}
              child={child}
              active={isPathActive(child.to, location.pathname, location.search, child.end)}
              onNavigate={onNavigate}
            />
          ))
        : group.items.map((item) =>
            item.children?.length ? (
              <SidebarSubmenu key={item.to ?? item.label} item={item} onNavigate={onNavigate} />
            ) : (
              <SidebarLink
                key={item.to ?? item.label}
                item={item}
                collapsed={false}
                onNavigate={onNavigate}
              />
            ),
          )}
    </nav>
  );
}

function SidebarGroupSection({
  group,
  index,
  collapsed,
  active,
  open,
  onToggle,
  onNavigate,
}: {
  group: SidebarGroup;
  index: number;
  collapsed: boolean;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const panelId = useId();
  const flatChildren =
    group.items.length === 1 && group.items[0]?.children?.length
      ? (group.items[0].children ?? null)
      : null;
  const collapsible = groupIsCollapsible(group);

  return (
    <div
      className={cn(
        index === 0 ? '' : 'mt-4 border-t border-white/15 pt-4',
        collapsed && 'lg:mt-2 lg:pt-2',
      )}
    >
      <div className={cn(collapsed && 'lg:hidden')}>
        {collapsible ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={onToggle}
            className={cn(
              'flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors focus-visible:outline-white/70 focus-visible:outline-2 focus-visible:outline-offset-2',
              active
                ? 'bg-white/5 text-white'
                : 'text-white/65 hover:bg-white/10 hover:text-white',
            )}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.24em]">
              {group.label}
            </span>
            <ChevronDown
              aria-hidden
              className={cn(
                'h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none',
                open ? 'rotate-0' : '-rotate-90',
                active ? 'text-white/80' : 'text-white/45',
              )}
            />
          </button>
        ) : (
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.24em] text-white/65">
            {group.label}
          </p>
        )}
        <div
          id={panelId}
          aria-hidden={collapsible && !open ? true : undefined}
          className={cn(
            'mt-2 grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none',
            !collapsible || open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          )}
        >
          <div
            className={cn('min-h-0 overflow-hidden', collapsible && !open && 'invisible')}
            inert={collapsible && !open ? true : undefined}
          >
            <SidebarGroupBody group={group} flatChildren={flatChildren} onNavigate={onNavigate} />
          </div>
        </div>
      </div>
      {collapsed ? (
        <CollapsedGroup group={group} active={active} onNavigate={onNavigate} />
      ) : null}
    </div>
  );
}

export function AppSidebar({
  ariaLabel,
  homeTo,
  groups,
  accountItems,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
  userName,
  userEmail,
  userInitials,
  onLogout,
  isLoggingOut,
  footerNote,
  badge,
}: AppSidebarProps) {
  const location = useLocation();
  const drawerRef = useRef<HTMLDivElement>(null);
  const isGroupActive = (group: SidebarGroup) =>
    group.items.some((item) => isItemActive(item, location.pathname, location.search));
  const activeGroupKey = groups.find(isGroupActive)?.key ?? null;
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(activeGroupKey);

  useEffect(() => {
    if (activeGroupKey) setOpenGroupKey(activeGroupKey);
  }, [activeGroupKey]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseMobile();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      drawerRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();
    }, 60);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-ink-950/45 backdrop-blur-[2px] lg:hidden"
          aria-label="Tutup navigasi"
          onClick={onCloseMobile}
        />
      ) : null}

      <aside
        ref={drawerRef}
        id="app-sidebar"
        className={cn(
          'sidebar-grain fixed inset-y-0 left-0 z-50 flex w-[288px] flex-col text-white transition-[width,transform] duration-[260ms] ease-out lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'lg:w-[76px]' : 'lg:w-[276px]',
        )}
        aria-label={ariaLabel}
      >
        <div
          className={cn(
            'flex h-16 shrink-0 items-center border-b border-white/15',
            collapsed ? 'justify-center px-2' : 'justify-between px-5',
          )}
        >
          <Link
            to={homeTo}
            onClick={onCloseMobile}
            className="shrink-0 rounded-lg focus-visible:outline-white/70"
            aria-label="Whoosh Stay"
          >
            <Logo tone="light" variant={collapsed ? 'symbol' : 'compact'} />
          </Link>
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Tutup sidebar"
          >
            <X className="h-5 w-5" />
          </button>
          {!collapsed ? (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="group relative hidden rounded-lg p-1.5 text-white/55 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 lg:inline-flex"
              aria-label="Ciutkan sidebar"
              aria-controls="app-sidebar"
              aria-expanded={true}
              aria-describedby="sidebar-toggle-tip-expanded"
              title="Ciutkan sidebar"
            >
              <Ellipsis className="h-5 w-5" />
              <span
                id="sidebar-toggle-tip-expanded"
                role="tooltip"
                className="pointer-events-none absolute right-0 top-full z-[60] mt-1.5 whitespace-nowrap rounded-lg bg-ink-950 px-2.5 py-1.5 text-[10px] font-semibold text-white opacity-0 shadow-xl ring-1 ring-white/10 transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100"
              >
                Ciutkan sidebar
              </span>
            </button>
          ) : null}
        </div>

        {collapsed ? (
          <div className="hidden justify-center border-b border-white/10 py-2 lg:flex">
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="group relative rounded-lg p-2 text-white/55 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-white/70 focus-visible:outline-2 focus-visible:outline-offset-2"
              aria-label="Perbesar sidebar"
              aria-controls="app-sidebar"
              aria-expanded={false}
              aria-describedby="sidebar-toggle-tip-collapsed"
              title="Perbesar sidebar"
            >
              <Ellipsis className="h-5 w-5" />
              <span
                id="sidebar-toggle-tip-collapsed"
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 z-[60] ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink-950 px-2.5 py-1.5 text-[10px] font-semibold text-white opacity-0 shadow-xl ring-1 ring-white/10 transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100"
              >
                Perbesar sidebar
              </span>
            </button>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto overflow-x-visible px-3 py-5 scrollbar-slim">
          {groups.map((group, index) => {
            const collapsible = groupIsCollapsible(group);
            return (
              <SidebarGroupSection
                key={group.key}
                group={group}
                index={index}
                collapsed={collapsed}
                active={isGroupActive(group)}
                open={collapsible && openGroupKey === group.key}
                onToggle={() =>
                  setOpenGroupKey((current) => (current === group.key ? null : group.key))
                }
                onNavigate={onCloseMobile}
              />
            );
          })}

          <div className={cn('mt-5 border-t border-white/10 pt-4', collapsed && 'lg:mt-2 lg:pt-2')}>
            <p
              className={cn(
                'px-3 text-[10px] font-bold uppercase tracking-[0.24em] text-white/65',
                collapsed && 'lg:hidden',
              )}
            >
              Akun
            </p>
            <nav aria-label="Akun" className="mt-2 space-y-1">
              {accountItems.map((item) => (
                <SidebarLink
                  key={item.to}
                  item={item}
                  collapsed={collapsed}
                  onNavigate={onCloseMobile}
                />
              ))}
            </nav>
          </div>

          {footerNote ? (
            <div className={cn('mx-1 mt-6', collapsed && 'lg:hidden')}>{footerNote}</div>
          ) : null}
        </div>

        <div className="border-t border-white/15 p-3">
          <div className={cn('flex items-center gap-3', collapsed && 'lg:flex-col lg:gap-2')}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold text-white ring-1 ring-white/20">
              {userInitials}
            </span>
            <div className={cn('min-w-0 flex-1 leading-tight', collapsed && 'lg:hidden')}>
              <p className="truncate text-xs font-semibold text-white">{userName}</p>
              <p className="mt-0.5 truncate text-[10px] text-white/65">{userEmail}</p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              disabled={isLoggingOut}
              aria-label="Keluar"
              title="Keluar"
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50',
              )}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          {badge ? <div className={cn('mt-3', collapsed && 'lg:hidden')}>{badge}</div> : null}
          <span className="sr-only" aria-live="polite">
            {isLoggingOut ? 'Sedang keluar' : ''}
          </span>
        </div>
      </aside>
    </>
  );
}

export function SidebarChevron({ label }: { label: string }) {
  return <span className="text-[11px] text-white/50">{label}</span>;
}
