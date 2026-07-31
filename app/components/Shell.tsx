"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Dropdown,
  Label,
} from "@heroui/react";
import {
  ChevronDown,
  ExternalLink,
  IdCard,
  LogOut,
  AlertTriangle,
  Clock,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import type { Me } from "../lib/api";
import { api } from "../lib/api";
import { notify } from "../lib/notify";
import UserAvatar from "./UserAvatar";

const SIDEBAR_KEY = "ta-payment:sidebar-collapsed";
/** Expanded panel, 256px. Down from w-68/w-72 (272/288). Measured, not
 *  guessed: at this width a nav label gets 189px, or ~159px once a count badge
 *  takes its place — and the longest label in the app ("ตรวจแบบฟอร์มใบแจ้งหนี้")
 *  is 144px, so nothing wraps or truncates. One width at every breakpoint
 *  keeps that guarantee from depending on the viewport. */
const PANEL_W = "w-64";
/** Icon rail. Wide enough for a 36px hit target plus breathing room. */
const RAIL_W = "w-16";

export interface NavItem {
  label: string;
  href: string;
  icon?: React.ComponentType<{ className?: string; size?: number }>;
  /**
   * Ordinal shown in place of the icon, for menus that are a SEQUENCE rather
   * than a set of destinations. The staff "สิ่งที่ต้องทำ" group uses this so the
   * order of work is readable from the sidebar — icons all look equally
   * important and say nothing about what comes first. Takes precedence over
   * `icon`.
   */
  step?: number;
  external?: boolean;
  exact?: boolean;
  /** ตัวเลขค้างที่ต้องทำ — แสดงเป็นตัวนับสีแดงท้ายเมนู (0/undefined = ไม่แสดง) */
  badge?: number;
  /** คำอธิบายของ badge สำหรับ screen reader เช่น "รอกำหนดวันชดเชย" */
  badgeLabel?: string;
  /**
   * State of the thing behind the link, when it is a state rather than a
   * count. `warn` = the user has to do something; `pending` = it is done and
   * waiting on someone else. A count badge would be wrong for both: "1" next
   * to "เอกสารของฉัน" says nothing about whether that 1 is the user's problem.
   * `badge` wins if both are set.
   */
  status?: NavStatus;
  /** Why the status icon is there, for screen readers and the hover tooltip. */
  statusLabel?: string;
}
export type NavStatus = "warn" | "pending";

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
  // Optional control rendered in the header's left area in place of the page
  // title — e.g. a course switcher that stays put while you move between pages.
  topBarLeft?: React.ReactNode;
  // Scope control rendered NEXT TO the title rather than replacing it — for a
  // selector that applies to every page (the staff term switcher). Separate
  // from topBarLeft because the page title still carries its weight here: the
  // term says which data, the title says which task.
  topBarScope?: React.ReactNode;
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
  topBarLeft,
  topBarScope,
  hideSidebar = false,
  children,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Collapsed = the icon rail. Persisted because it is a working preference,
  // not a per-page mode: someone who narrowed the chrome to see more of a
  // timetable means it for the whole session, not one route.
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {
      // Storage blocked — start expanded, which is the safe default.
    }
  }, []);
  function setCollapsedPersistent(v: boolean) {
    setCollapsed(v);
    if (v) setHovered(false);
    try {
      localStorage.setItem(SIDEBAR_KEY, v ? "1" : "0");
    } catch {
      // Not fatal; the choice just won't survive a reload.
    }
  }
  // Labels show when the panel is pinned open, or while the pointer rests on
  // the rail. Leaving the rail returns it to icons with no click needed.
  const sidebarOpen = !collapsed || hovered;

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
      {/* Desktop sidebar.
          Two widths: a full panel, and a 64px icon rail. The rail is the
          collapsed state; hovering it expands the panel OVER the content
          rather than pushing it, so peeking at a label never reflows the page
          you are reading. The placeholder div keeps the rail's width in the
          layout while the panel itself is fixed. */}
      {!hideSidebar && (
      <div className={`hidden md:block shrink-0 relative ${collapsed ? RAIL_W : PANEL_W}`}>
        <aside
          onMouseEnter={() => collapsed && setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={
            "fixed inset-y-0 left-0 z-30 flex flex-col bg-surface border-r border-border " +
            "transition-[width] duration-150 ease-out " +
            (sidebarOpen ? `${PANEL_W} ` : `${RAIL_W} `) +
            (collapsed && hovered ? "shadow-xl" : "")
          }
        >
          {sidebarOpen ? (
            <BrandBlock brandTitle={brandTitle} />
          ) : (
            <div className="h-14 flex items-center justify-center border-b border-border">
              <Link href="/" aria-label={`${brandTitle} — ไปหน้าแรก`}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-accent-foreground font-bold text-sm bg-accent">
                T
              </Link>
            </div>
          )}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
            {nav.map((section, i) => (
              <div key={i} className="mb-1">
                {section.title && (
                  sidebarOpen ? (
                    <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted truncate">
                      {section.title}
                    </div>
                  ) : (
                    // A heading cannot survive 64px, but the grouping still
                    // carries meaning — keep the boundary as a rule.
                    i > 0 && <div className="mx-3 my-2 border-t border-border" />
                  )
                )}
                {section.items.map(item => (
                  <NavRow key={item.href} item={item} activeHref={activeHref}
                          rail={!sidebarOpen}
                          onClick={() => setMobileOpen(false)} />
                ))}
              </div>
            ))}
          </nav>
          <div className="border-t border-border p-2">
            <button
              type="button"
              onClick={() => setCollapsedPersistent(!collapsed)}
              aria-label={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
              aria-expanded={!collapsed}
              title={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
              className={
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground/70 " +
                "hover:bg-surface-secondary hover:text-foreground w-full " +
                (sidebarOpen ? "" : "justify-center px-0")
              }
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              {sidebarOpen && <span className="truncate">ย่อเมนู</span>}
            </button>
          </div>
        </aside>
      </div>
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
          topBarLeft={topBarLeft}
          topBarScope={topBarScope}
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
  rail = false,
  onClick,
}: {
  item: NavItem;
  activeHref: string | null;
  /** Icon-only mode: labels and count badges have no room. */
  rail?: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  const active = !item.external && item.href === activeHref;

  const cls = [
    "flex items-center gap-2.5 px-3 py-2 mx-2 my-0.5 rounded-lg text-sm font-medium transition-colors",
    rail ? "justify-center px-0" : "",
    active
      ? "bg-accent-soft text-accent-soft-foreground"
      : "text-foreground/80 hover:bg-surface-secondary hover:text-foreground",
  ].join(" ");

  // A step number occupies the icon slot at the same 16px box, so numbered and
  // icon rows keep a single text alignment down the sidebar.
  const leading = item.step ? (
    <span
      aria-hidden
      className={
        "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold leading-none " +
        // Both states tint a circle behind the row's own text colour. Inverting
        // on active (solid fill + `accent-soft` text) looked right in the
        // palette but `accent-soft` is a translucent token — 15% alpha on a
        // solid fill rendered the number invisible.
        (active
          ? "bg-accent-soft-foreground/15 text-accent-soft-foreground"
          : "bg-foreground/10 text-foreground/70")
      }
    >
      {item.step}
    </span>
  ) : Icon ? (
    <Icon size={16} />
  ) : null;

  const hasBadge = !!item.badge && item.badge > 0;
  // Badge wins: a number is more specific than a state, and showing both puts
  // two competing marks on one row.
  const status = hasBadge ? undefined : item.status;
  const statusIcon = status === "warn"
    ? <AlertTriangle size={14} className="text-warning-soft-foreground" />
    : status === "pending"
      ? <Clock size={14} className="text-muted" />
      : null;
  const statusTitle = status ? (item.statusLabel ?? (status === "warn" ? "ต้องดำเนินการ" : "รอตรวจสอบ")) : undefined;

  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls}
         onClick={onClick} title={rail ? item.label : undefined}>
        {leading}
        {!rail && (
          <>
            <span className="flex-1">{item.label}</span>
            <ExternalLink size={13} className="opacity-60" />
          </>
        )}
      </a>
    );
  }
  return (
    <Link href={item.href} className={cls} onClick={onClick}
          // Native tooltip in rail mode: the label is the only thing that says
          // what the icon does, and hiding it entirely would make the rail a
          // guessing game for anyone who has not memorised the order.
          title={rail ? [item.label, statusTitle].filter(Boolean).join(" — ") : undefined}
          aria-label={rail ? item.label : undefined}>
      {rail ? (
        <span className="relative inline-flex">
          {leading}
          {/* No room for a count or an icon — a dot still answers "does this
              need me?", which is what both marks exist for. Amber vs grey keeps
              "your turn" separate from "waiting on staff". */}
          {(hasBadge || status) && (
            <span
              aria-label={hasBadge
                ? `${item.badgeLabel ?? "ค้างอยู่"} ${item.badge} รายการ`
                : statusTitle}
              className={
                "absolute -top-1 -right-1 size-2 rounded-full ring-2 ring-surface " +
                (hasBadge ? "bg-danger" : status === "warn" ? "bg-warning" : "bg-foreground/40")
              }
            />
          )}
        </span>
      ) : (
        <>
          {leading}
          <span className="flex-1 truncate">{item.label}</span>
          {hasBadge && (
            <span
              className="inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white"
              aria-label={`${item.badgeLabel ?? "ค้างอยู่"} ${item.badge} รายการ`}
            >
              {item.badge}
            </span>
          )}
          {statusIcon && (
            <span className="shrink-0" title={statusTitle} aria-label={statusTitle}>
              {statusIcon}
            </span>
          )}
        </>
      )}
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
  topBarLeft,
  topBarScope,
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
  topBarLeft?: React.ReactNode;
  topBarScope?: React.ReactNode;
  showMobileMenu?: boolean;
  showBrandInHeader?: boolean;
}) {
  const router = useRouter();
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
      ) : topBarLeft ? (
        <div className="flex-1 min-w-0 flex items-center">{topBarLeft}</div>
      ) : (
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <div className="text-sm font-medium text-foreground truncate">{title}</div>
        </div>
      )}

      {topBarScope}
      {topBarAccessory}

      <Dropdown>
        <Button variant="ghost" aria-label="เมนูผู้ใช้" className="px-1.5! gap-2! h-auto! py-1!">
          <UserAvatar firstName={me.first_name} lastName={me.last_name} src={me.avatar_url} />
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
