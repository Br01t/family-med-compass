import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Users, ArrowRight, Menu, X } from "lucide-react";
import { useFamilyMed } from "@/lib/store";

interface PublicHeaderProps {
  currentPath?: string;
}

export function PublicHeader({ currentPath }: PublicHeaderProps) {
  const { user, userProfile, loadingAuth } = useFamilyMed();
  const [mobileOpen, setMobileOpen] = useState(false);

  const appLink =
    userProfile?.role === "paziente"
      ? "/paziente"
      : userProfile?.role === "caregiver"
        ? "/caregiver"
        : "/impostazioni";

  const navLinkClass = (path: string) =>
    `rounded-full px-3.5 py-2 text-sm font-semibold transition-all ${
      currentPath === path
        ? "bg-emerald-900/10 text-emerald-900 font-bold"
        : "text-stone-600 hover:bg-stone-200/60 hover:text-stone-950"
    }`;

  return (
    <header className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-7 relative z-30">
      <div className="flex items-center justify-between gap-3">
        <Link to="/" className="group flex min-w-0 shrink items-center gap-2 sm:gap-2.5 transition-transform active:scale-[0.98]">
          <div className="grid size-9 sm:size-10 shrink-0 place-items-center rounded-2xl bg-emerald-800 text-emerald-50 shadow-sm transition-colors group-hover:bg-emerald-900">
            <Users className="size-4.5 sm:size-5" />
          </div>
          <p className="whitespace-nowrap font-display text-lg sm:text-2xl leading-none tracking-tight text-stone-900 font-bold">
            FamilyMed
          </p>
        </Link>

        {/* Nav completa: solo da sm in su */}
        <nav className="hidden sm:flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          <Link to={"/prezzi" as any} className={navLinkClass("/prezzi")}>
            Prezzi
          </Link>
          <Link to="/guida-pubblica" className={navLinkClass("/guida-pubblica")}>
            Guida
          </Link>

          {!loadingAuth && user ? (
            <Link
              to={appLink as any}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-800 px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-sm transition-all hover:bg-emerald-900 hover:shadow-md active:scale-[0.98]"
            >
              Vai all'app
              <ArrowRight className="size-3.5" />
            </Link>
          ) : (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link
                to="/login"
                className="rounded-full border border-stone-300/80 bg-white/80 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-stone-700 shadow-xs transition-all hover:bg-white hover:text-stone-950 hover:border-stone-400"
              >
                Accedi
              </Link>
              <Link
                to="/registrati"
                className="inline-flex items-center rounded-full bg-emerald-800 px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-sm transition-all hover:bg-emerald-900 hover:shadow-md active:scale-[0.98]"
              >
                Inizia gratis
              </Link>
            </div>
          )}
        </nav>

        {/* Pulsante menu: solo sotto sm */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Chiudi menu" : "Apri menu"}
          aria-expanded={mobileOpen}
          className="flex sm:hidden shrink-0 size-10 items-center justify-center rounded-2xl border border-stone-300/80 bg-white/85 text-stone-700 shadow-xs transition-colors active:scale-[0.97]"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Pannello menu mobile */}
      {mobileOpen && (
        <nav className="sm:hidden mt-3 flex flex-col gap-1.5 rounded-3xl border border-stone-200/90 bg-white/95 p-3 shadow-md backdrop-blur-md">
          <Link
            to={"/prezzi" as any}
            onClick={() => setMobileOpen(false)}
            className={`rounded-2xl px-4 py-3 text-base font-semibold transition-colors ${
              currentPath === "/prezzi" ? "bg-emerald-900/10 text-emerald-900 font-bold" : "text-stone-700 hover:bg-stone-100"
            }`}
          >
            Prezzi
          </Link>
          <Link
            to="/guida-pubblica"
            onClick={() => setMobileOpen(false)}
            className={`rounded-2xl px-4 py-3 text-base font-semibold transition-colors ${
              currentPath === "/guida-pubblica" ? "bg-emerald-900/10 text-emerald-900 font-bold" : "text-stone-700 hover:bg-stone-100"
            }`}
          >
            Guida
          </Link>

          <div className="my-1 border-t border-stone-100" />

          {!loadingAuth && user ? (
            <Link
              to={appLink as any}
              onClick={() => setMobileOpen(false)}
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-800 px-4 py-3 text-base font-bold text-white shadow-sm transition-all active:scale-[0.98]"
            >
              Vai all'app
              <ArrowRight className="size-4" />
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="rounded-2xl border border-stone-300/80 bg-white px-4 py-3 text-center text-base font-semibold text-stone-700 transition-colors active:scale-[0.98]"
              >
                Accedi
              </Link>
              <Link
                to="/registrati"
                onClick={() => setMobileOpen(false)}
                className="rounded-2xl bg-emerald-800 px-4 py-3 text-center text-base font-bold text-white shadow-sm transition-all active:scale-[0.98]"
              >
                Inizia gratis
              </Link>
            </>
          )}
        </nav>
      )}
    </header>
  );
}