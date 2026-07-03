import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Target, Search, Settings } from "lucide-react";
import { Logo } from "./Logo";
import { useSidebar } from "@/hooks/useSidebar";

const items = [
  { to: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/matching", label: "Matching à la demande", icon: Target },
  // { to: "/push", label: "Veille push", icon: BellRing }, // masqué (pas prioritaire — réactivable)
  { to: "/explorer", label: "Explorer", icon: Search },
  { to: "/admin", label: "Administration", icon: Settings },
];

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { collapsed, setCollapsed } = useSidebar();

  return (
    <aside
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => setCollapsed(true)}
      className={`fixed left-0 top-0 bottom-0 bg-white border-r border-border flex flex-col z-30 transition-[width] duration-300 ${
        collapsed ? "w-[64px]" : "w-[240px]"
      }`}
    >
      <div className={`h-24 flex items-center border-b border-border overflow-hidden ${collapsed ? "justify-center px-2" : "justify-center px-5"}`}>
        {collapsed ? (
          <div className="w-9 h-9 rounded-md bg-navy text-white flex items-center justify-center font-bold">L</div>
        ) : (
          <Logo />
        )}
      </div>

      <nav className="flex-1 px-2 pt-5 space-y-1">
        {items.map((it) => {
          const active = it.to === "/" ? pathname === "/" : pathname.startsWith(it.to);
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              title={collapsed ? it.label : undefined}
              className={`flex items-center gap-3 rounded-md text-sm transition ${
                collapsed ? "justify-center h-10 w-10 mx-auto" : "px-3 py-2.5"
              } ${
                active
                  ? "bg-navy text-white"
                  : "text-text hover:bg-[var(--color-accent)] hover:text-navy"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="whitespace-nowrap">{it.label}</span>}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="p-4 border-t border-border">
          <div className="label-caps mb-1">Dernière synchro</div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 live-dot" />
            Aujourd'hui · 08h12
          </div>
        </div>
      )}
    </aside>
  );
}
