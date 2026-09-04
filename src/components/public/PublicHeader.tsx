import { Link } from "@tanstack/react-router";
import { Users, ArrowRight } from "lucide-react";
import { useFamilyMed } from "@/lib/store";

interface PublicHeaderProps {
  currentPath?: string;
}

export function PublicHeader({ currentPath }: PublicHeaderProps) {
  const { user, userProfile, loadingAuth } = useFamilyMed();

  const appLink =
    userProfile?.role === "paziente"
      ? "/paziente"
      : userProfile?.role === "caregiver"
        ? "/caregiver"
        : "/impostazioni";

  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6 sm:py-7 relative z-20">
      <Link to="/" className="group flex min-w-0 items-center gap-2.5 transition-transform active:scale-[0.98]">
        <div className="grid size-9 sm:size-10 shrink-0 place-items-center rounded-2xl bg-emerald-800 text-emerald-50 shadow-sm transition-colors group-hover:bg-emerald-900">
          <Users className="size-4.5 sm:size-5" />
        </div>
        <p className="truncate font-display text-xl sm:text-2xl leading-none tracking-tight text-stone-900 italic font-bold">
          FamilyMed
        </p>
      </Link>

      <nav className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
        <Link
          to={"/prezzi" as any}
          className={`rounded-full px-3.5 py-2 text-sm font-semibold transition-all ${
            currentPath === "/prezzi"
              ? "bg-emerald-900/10 text-emerald-900 font-bold"
              : "text-stone-600 hover:bg-stone-200/60 hover:text-stone-950"
          }`}
        >
          Prezzi
        </Link>
        <Link
          to="/guida-pubblica"
          className={`rounded-full px-3.5 py-2 text-sm font-semibold transition-all ${
            currentPath === "/guida-pubblica"
              ? "bg-emerald-900/10 text-emerald-900 font-bold"
              : "text-stone-600 hover:bg-stone-200/60 hover:text-stone-950"
          }`}
        >
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
              className="hidden sm:inline-flex items-center rounded-full bg-emerald-800 px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-sm transition-all hover:bg-emerald-900 hover:shadow-md active:scale-[0.98]"
            >
              Inizia gratis
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
