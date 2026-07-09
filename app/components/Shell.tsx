"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Avatar,
  Button,
  Dropdown,
  Label,
} from "@heroui/react";
import {
  ChevronDown,
  ExternalLink,
  IdCard,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import type { Me } from "../lib/api";
import { api } from "../lib/api";
import { notify } from "../lib/notify";

export interface NavItem {
  label: string;
  href: string;
  icon?: React.ComponentType<{ className?: string; size?: number }>;
  external?: boolean;
  exact?: boolean;
}
export interface NavSection {
  title?: string;
  items: NavItem[];
}

export interface UserMenuItem {
  id: string;
  label: string;
  href: string;
  icon?: React.ComponentType<{ className?: string; size?: number }>;
}

interface Props {
  me: Me;
  brandTitle: string;
  nav: NavSection[];
  // Personal items shown in the top-right user dropdown (profile, personal
  // schedule, notifications, etc.). Separate from `nav` so they can live
  // with account info instead of the feature sidebar.
  userMenuItems?: UserMenuItem[];
  // Custom slot rendered in the header just left of the avatar dropdown —
  // typically a notification bell or similar contextual control.
  topBarAccessory?: React.ReactNode;
  // When true, the sidebar and mobile drawer are omitted — used for a
  // browse-oriented "home" that mimics the lecturer's shell.
  hideSidebar?: boolean;
  children: React.ReactNode;
}

export default function Shell({
  me,
  brandTitle,
  nav,
  userMenuItems,
  topBarAccessory,
  hideSidebar = false,
  children,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      // The session cookie is httpOnly, so we can't clear it client-side. Warn
      // the user (shared-lab machines) but still navigate away.
      notify.error(e);
    }
    router.push("/login");
    router.refresh();
  }

  const flatItems = useMemo(() => nav.flatMap(s => s.items), [nav]);

  const activeHref = useMemo(() => matchActiveHref(flatItems, pathname), [flatItems, pathname]);

  const currentTitle = useMemo(() => {
    const active = flatItems.find(i => i.href === activeHref);
    return active?.label ?? brandTitle;
  }, [flatItems, activeHref, brandTitle]);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar — sticky at viewport height so long content doesn't
          stretch it, and internal nav scrolls on overflow. */}
      {!hideSidebar && (
      <aside className="hidden md:flex flex-col shrink-0 bg-surface border-r border-border w-60 lg:w-65 sticky top-0 h-screen">
        <BrandBlock brandTitle={brandTitle} />
        <nav className="flex-1 overflow-y-auto py-2">
          {nav.map((section, i) => (
            <div key={i} className="mb-1">
              {section.title && (
                <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {section.title}
                </div>
              )}
              {section.items.map(item => (
                <NavRow key={item.href} item={item} activeHref={activeHref} onClick={() => setMobileOpen(false)} />
              ))}
            </div>
          ))}
        </nav>
      </aside>
      )}

      {/* Mobile drawer */}
      {!hideSidebar && mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-backdrop" />
          <aside className="absolute inset-y-0 left-0 w-[85vw] max-w-75 bg-surface shadow-xl flex flex-col"
                 onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-border">
              <BrandMark brandTitle={brandTitle} />
              <Button variant="ghost" isIconOnly size="sm" onPress={() => setMobileOpen(false)} aria-label="ปิดเมนู">
                <X size={18} />
              </Button>
            </div>
            <nav className="flex-1 overflow-y-auto py-2">
              {nav.map((section, i) => (
                <div key={i} className="mb-1">
                  {section.title && (
                    <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                      {section.title}
                    </div>
                  )}
                  {section.items.map(item => (
                    <NavRow key={item.href} item={item} activeHref={activeHref} onClick={() => setMobileOpen(false)} />
                  ))}
                </div>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Main column */}
      <main className="flex-1 flex flex-col min-w-0 min-h-screen">
        <TopBar
          title={currentTitle}
          me={me}
          brandTitle={brandTitle}
          onLogout={logout}
          onOpenMobile={() => setMobileOpen(true)}
          userMenuItems={userMenuItems}
          topBarAccessory={topBarAccessory}
          showMobileMenu={!hideSidebar}
          showBrandInHeader={hideSidebar}
        />
        <div className="flex-1 p-4 md:p-8 max-w-[1400px] w-full mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sidebar sub-components                                                     */
/* -------------------------------------------------------------------------- */

function BrandBlock({ brandTitle }: { brandTitle: string }) {
  return (
    <div className="h-14 px-4 flex items-center border-b border-border">
      <BrandMark brandTitle={brandTitle} />
    </div>
  );
}

function BrandMark({ brandTitle }: { brandTitle: string }) {
  return (
    <Link
      href="/"
      aria-label={`${brandTitle} — ไปหน้าแรก`}
      className="flex items-center gap-2 rounded-md -mx-1 px-1 py-0.5 hover:bg-surface-secondary transition-colors"
    >
      <div className="w-7 h-7 rounded-md flex items-center justify-center text-accent-foreground font-bold text-sm bg-accent">
        T
      </div>
      <div className="font-semibold text-[15px] text-foreground leading-tight">{brandTitle}</div>
    </Link>
  );
}

function matchActiveHref(items: NavItem[], pathname: string | null): string | null {
  if (!pathname) return null;
  let best: { href: string; length: number } | null = null;
  for (const item of items) {
    if (item.external) continue;
    const matches = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");
    if (!matches) continue;
    if (!best || item.href.length > best.length) {
      best = { href: item.href, length: item.href.length };
    }
  }
  return best?.href ?? null;
}

function NavRow({
  item,
  activeHref,
  onClick,
}: {
  item: NavItem;
  activeHref: string | null;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  const active = !item.external && item.href === activeHref;

  const cls = [
    "flex items-center gap-2.5 px-3 py-2 mx-2 my-0.5 rounded-lg text-sm font-medium transition-colors",
    active
      ? "bg-accent-soft text-accent-soft-foreground"
      : "text-foreground/80 hover:bg-surface-secondary hover:text-foreground",
  ].join(" ");

  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls} onClick={onClick}>
        {Icon && <Icon size={16} />}
        <span className="flex-1">{item.label}</span>
        <ExternalLink size={13} className="opacity-60" />
      </a>
    );
  }
  return (
    <Link href={item.href} className={cls} onClick={onClick}>
      {Icon && <Icon size={16} />}
      <span className="flex-1">{item.label}</span>
    </Link>
  );
}

// Priority order — a user may have multiple roles (e.g. staff + lecturer),
// so pick the most privileged label to show.
export function roleLabel(roles: string[]): string {
  if (roles.includes("admin")) return "ผู้ดูแลระบบ";
  if (roles.includes("staff")) return "เจ้าหน้าที่";
  if (roles.includes("lecturer")) return "อาจารย์";
  if (roles.includes("ta")) return "ผู้ช่วยสอน (TA)";
  return "ผู้ใช้งาน";
}

/* -------------------------------------------------------------------------- */
/* Top bar                                                                    */
/* -------------------------------------------------------------------------- */

function TopBar({
  title,
  me,
  brandTitle,
  onLogout,
  onOpenMobile,
  userMenuItems,
  topBarAccessory,
  showMobileMenu = true,
  showBrandInHeader = false,
}: {
  title: string;
  me: Me;
  brandTitle: string;
  onLogout: () => void;
  onOpenMobile: () => void;
  userMenuItems?: UserMenuItem[];
  topBarAccessory?: React.ReactNode;
  showMobileMenu?: boolean;
  showBrandInHeader?: boolean;
}) {
  const router = useRouter();
  const initials = ((me.first_name?.[0] ?? "") + (me.last_name?.[0] ?? "")).toUpperCase() || "U";
  const menuItems = userMenuItems ?? [];
  const fullName = [me.title, me.first_name, me.last_name].filter(Boolean).join(" ");
  const roleLbl = roleLabel(me.roles);
  return (
    <header className="h-14 border-b border-border bg-surface flex items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 sticky top-0 z-30">
      {showMobileMenu && (
        <Button variant="ghost" isIconOnly size="sm" onPress={onOpenMobile}
                aria-label="เปิดเมนู" className="md:hidden">
          <Menu size={20} />
        </Button>
      )}
      {showBrandInHeader ? (
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <BrandMark brandTitle={brandTitle} />
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground truncate">{title}</div>
        </div>
      )}

      {topBarAccessory}

      <Dropdown>
        <Button variant="ghost" aria-label="เมนูผู้ใช้" className="px-1.5! gap-2! h-auto! py-1!">
          <Avatar>
            <Avatar.Fallback>{initials}</Avatar.Fallback>
          </Avatar>
          <div className="hidden sm:flex flex-col items-start min-w-0 leading-tight">
            <span className="text-sm font-medium text-foreground truncate max-w-40 md:max-w-56">
              {fullName}
            </span>
            <span className="text-xs text-muted truncate max-w-40 md:max-w-56">
              {roleLbl}
            </span>
          </div>
          <ChevronDown size={14} />
        </Button>
        <Dropdown.Popover>
          <div className="px-3 py-2.5 border-b border-border">
            <div className="text-sm font-medium text-foreground truncate max-w-50">
              {fullName}
            </div>
            <div className="text-xs text-muted truncate max-w-50">{roleLbl}</div>
            <div className="text-xs text-muted truncate max-w-50">{me.email}</div>
          </div>
          <Dropdown.Menu
            onAction={(key: React.Key) => {
              if (key === "logout") { onLogout(); return; }
              const item = menuItems.find(m => m.id === String(key));
              if (item) router.push(item.href);
            }}
          >
            {menuItems.map(item => {
              const Icon = item.icon ?? IdCard;
              return (
                <Dropdown.Item key={item.id} id={item.id} textValue={item.label}>
                  <Icon className="size-4 shrink-0" />
                  <Label>{item.label}</Label>
                </Dropdown.Item>
              );
            })}
            <Dropdown.Item id="logout" textValue="ออกจากระบบ" variant="danger">
              <LogOut className="size-4 shrink-0 text-danger" />
              <Label>ออกจากระบบ</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </header>
  );
}
