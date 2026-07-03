import { createContext, useContext, useState, type ReactNode } from "react";

type Ctx = { collapsed: boolean; setCollapsed: (v: boolean) => void; toggle: () => void };
const SidebarCtx = createContext<Ctx>({ collapsed: true, setCollapsed: () => {}, toggle: () => {} });

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(true);
  return (
    <SidebarCtx.Provider value={{ collapsed, setCollapsed, toggle: () => setCollapsed((v) => !v) }}>
      {children}
    </SidebarCtx.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarCtx);
}
