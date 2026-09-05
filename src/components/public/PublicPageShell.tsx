import { ReactNode } from "react";
import { PublicHeader } from "./PublicHeader";
import { PublicFooter } from "./PublicFooter";

interface PublicPageShellProps {
  children: ReactNode;
  currentPath?: string;
  hideFooter?: boolean;
}

export function PublicPageShell({
  children,
  currentPath,
  hideFooter = false,
}: PublicPageShellProps) {
  return (
    <div className="landing-light relative min-h-screen w-full max-w-full overflow-x-hidden bg-[#FAF8F5] text-left text-stone-800 selection:bg-emerald-100 selection:text-emerald-900">
      {/* Sfondo organico fluido */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-fluid-blob absolute -top-28 -left-24 h-[420px] w-[420px] rounded-full bg-emerald-200/70 blur-2xl" />
        <div
          className="animate-fluid-blob absolute top-6 -right-20 h-[440px] w-[440px] rounded-full bg-amber-200/60 blur-2xl"
          style={{ animationDelay: "-7s" }}
        />
      </div>

      <PublicHeader currentPath={currentPath} />

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 relative">
        {children}
      </main>

      {!hideFooter && <PublicFooter />}
    </div>
  );
}