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
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6 sm:py-7">
      <Link to="/" className="flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-90">
        <div className="grid size-9 shrink-0 place-items-center rounded-2xl bg-ocean-300 text-ocean-950 shadow-ocean sm:size-10">
          <Users className="size-4.5 sm:size-5" />
        </div>
        <p className="truncate font-display text-xl leading-none tracking-tight text-white italic sm:text-2xl">
          FamilyMed
        </p>
      </Link>

      <nav className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        <Link
          to={"/prezzi" as any}
          className={`rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
            currentPath === "/prezzi"
              ? "bg-ocean-800/60 text-ocean-300"
              : "text-ocean-100 hover:bg-ocean-800/40 hover:text-white"
          }`}
        >
          Prezzi
        </Link>
        <Link
          to="/guida-pubblica"
          className={`rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
            currentPath === "/guida-pubblica"
              ? "bg-ocean-800/60 text-ocean-300"
              : "text-ocean-100 hover:bg-ocean-800/40 hover:text-white"
          }`}
        >
          Guida
        </Link>

        {!loadingAuth && user ? (
          <Link
            to={appLink as any}
            className="inline-flex items-center gap-1.5 rounded-full bg-ocean-300 px-4 py-2 text-xs font-extrabold text-ocean-950 shadow-ocean transition-all hover:bg-ocean-200 active:scale-[0.98] sm:text-sm"
          >
            Vai all'app
            <ArrowRight className="size-3.5" />
          </Link>
        ) : (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link
              to="/login"
              className="rounded-full border border-ocean-600/40 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:border-ocean-300/60 hover:bg-ocean-800/40 hover:text-ocean-300 sm:text-sm"
            >
              Accedi
            </Link>
            <Link
              to="/registrati"
              className="hidden sm:inline-flex items-center rounded-full bg-ocean-300 px-4 py-2 text-xs font-extrabold text-ocean-950 shadow-ocean transition-all hover:bg-ocean-200 active:scale-[0.98] sm:text-sm"
            >
              Inizia gratis
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
