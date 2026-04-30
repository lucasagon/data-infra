import type { PropsWithChildren } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../app/AuthContext";

export function AppShell({ children }: PropsWithChildren) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,color-mix(in_oklab,white_82%,var(--brand-primary))_0%,#eef4f7_100%)] text-slate-900">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--brand-primary-strong)]">inventory_control</p>
            <h1 className="text-2xl font-semibold">Controle de estoque e patrimonio</h1>
          </div>

          <div className="flex items-center gap-4">
            <nav className="flex gap-2 text-sm">
              <NavLink className="rounded-full px-4 py-2 hover:bg-slate-100" to="/dashboard">
                Dashboard
              </NavLink>
              <NavLink className="rounded-full px-4 py-2 hover:bg-slate-100" to="/explorer">
                Explorer
              </NavLink>
              <NavLink className="rounded-full px-4 py-2 hover:bg-slate-100" to="/settings">
                Configurações
              </NavLink>
              <NavLink className="rounded-full px-4 py-2 hover:bg-slate-100" to="/history">
                Histórico de Modificações
              </NavLink>
            </nav>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm">
              <div className="font-medium">{user?.name}</div>
              <div className="text-slate-500">{user?.role}</div>
            </div>

            <button className="rounded-full bg-[var(--brand-primary)] px-4 py-2 text-sm text-white transition hover:bg-[var(--brand-primary-strong)]" onClick={() => logout()}>
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
