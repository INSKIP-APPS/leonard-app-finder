import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Target, Search, LogOut, Settings } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Logo } from "./Logo";
import { useSidebar } from "@/hooks/useSidebar";
import { useProfil, signOut, isAuthEnabled } from "@/services/auth";
import { getProgrammes } from "@/services/programmes";

const items = [
  { to: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/matching", label: "Matching à la demande", icon: Target },
  { to: "/explorer", label: "Explorer", icon: Search },
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
      <div
        className={`h-24 flex items-center border-b border-border overflow-hidden ${collapsed ? "justify-center px-2" : "justify-center px-5"}`}
      >
        {collapsed ? (
          <div className="w-9 h-9 rounded-md bg-navy text-white flex items-center justify-center font-bold">
            L
          </div>
        ) : (
          <Logo />
        )}
      </div>

      <nav className="flex-1 px-2 pt-5 space-y-1 overflow-y-auto">
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
                  ? "bg-sky text-white"
                  : "text-text hover:bg-[var(--color-accent)] hover:text-sky-ink"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="whitespace-nowrap">{it.label}</span>}
            </Link>
          );
        })}

        {isAuthEnabled && <ProgrammesBlock collapsed={collapsed} pathname={pathname} />}
      </nav>

      {isAuthEnabled && <UserBlock collapsed={collapsed} />}
    </aside>
  );
}

// ── Bloc Programmes ────────────────────────────────────────────────────
function ProgrammesBlock({ collapsed, pathname }: { collapsed: boolean; pathname: string }) {
  const { data: programmes = [] } = useQuery({
    queryKey: ["programmes"],
    queryFn: getProgrammes,
    staleTime: 5 * 60_000,
  });
  if (!programmes.length) return null;

  return (
    <div className="pt-5">
      {!collapsed && (
        <div className="px-3 pb-1.5 text-[10px] uppercase tracking-widest font-semibold text-muted">
          Programmes
        </div>
      )}
      {programmes.map((p) => {
        const active = pathname === `/programmes/${p.id}`;
        return (
          <Link
            key={p.id}
            to="/programmes/$id"
            params={{ id: p.id }}
            title={collapsed ? p.nom : undefined}
            className={`flex items-center gap-3 rounded-md text-sm transition ${
              collapsed ? "justify-center h-10 w-10 mx-auto" : "px-3 py-2"
            } ${
              active
                ? "bg-sky text-white"
                : "text-text hover:bg-[var(--color-accent)] hover:text-sky-ink"
            }`}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: p.couleur ?? "#00B7E0" }}
            />
            {!collapsed && <span className="whitespace-nowrap">{p.nom}</span>}
          </Link>
        );
      })}
    </div>
  );
}

// ── Menu compte (bas de sidebar) ─────────────────────────────────────
function UserBlock({ collapsed }: { collapsed: boolean }) {
  const { profil } = useProfil();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  if (!profil) return null;

  const initials = (profil.nom || profil.email)
    .split(/[.\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  const roleLabel = { admin: "Administrateur", editeur: "Éditeur", lecture: "Lecture" }[profil.role];
  const isAdmin = profil.role === "admin";
  const onAdmin = pathname.startsWith("/admin");

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login" });
  }

  return (
    <div className="border-t border-border px-2 py-3 space-y-1">
      {isAdmin && (
        <Link
          to="/admin"
          title={collapsed ? "Administration" : undefined}
          className={`flex items-center gap-3 rounded-md text-sm transition ${
            collapsed ? "justify-center h-10 w-10 mx-auto" : "px-3 py-2.5"
          } ${
            onAdmin
              ? "bg-sky text-white"
              : "text-text hover:bg-[var(--color-accent)] hover:text-sky-ink"
          }`}
        >
          <Settings className="w-4 h-4 shrink-0" />
          {!collapsed && <span className="whitespace-nowrap">Administration</span>}
        </Link>
      )}

      <div
        className={`flex items-center gap-3 rounded-md ${collapsed ? "justify-center" : "px-2 py-2"}`}
        title={collapsed ? `${profil.nom ?? profil.email} — ${roleLabel}` : undefined}
      >
        <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-sky to-navy text-white flex items-center justify-center text-xs font-bold">
          {initials || "?"}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate">{profil.nom ?? profil.email}</div>
            <div className="text-[10px] text-muted truncate">{roleLabel}</div>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={handleSignOut}
            title="Se déconnecter"
            className="p-1.5 rounded-md text-muted hover:text-navy hover:bg-[var(--color-accent)] transition"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
