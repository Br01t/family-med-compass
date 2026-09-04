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
    <div className="landing-light min-h-screen w-full max-w-full overflow-x-hidden bg-[#FAF8F5] text-left text-stone-800 selection:bg-emerald-100 selection:text-emerald-900">
      {/* Sfondo organico fluido — absolute dentro overflow-hidden */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-fluid-blob absolute -top-32 -left-20 h-[480px] w-[480px] bg-gradient-to-tr from-emerald-100 via-teal-50 to-emerald-50 opacity-70 blur-3xl" />
        <div
          className="animate-fluid-blob absolute top-10 -right-24 h-[520px] w-[520px] bg-gradient-to-bl from-amber-100 via-orange-50 to-stone-100 opacity-55 blur-3xl"
          style={{ animationDelay: "-7s" }}
        />
        <svg className="absolute inset-0 h-full w-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="shell-wave" width="72" height="72" patternUnits="userSpaceOnUse">
              <path d="M0 36 C 18 18, 36 54, 54 36 C 63 27, 68 27, 72 36" fill="none" stroke="#1B4332" strokeWidth="1.2" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#shell-wave)" />
        </svg>
      </div>

      <PublicHeader currentPath={currentPath} />

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 relative">
        {children}
      </main>

      {!hideFooter && <PublicFooter />}
    </div>
  );
}
