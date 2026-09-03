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
    <div className="landing-ocean min-h-screen w-full max-w-full overflow-x-hidden bg-ocean-950 text-left text-white selection:bg-ocean-300 selection:text-ocean-950">
      {/* Glow d'atmosfera sottili */}
      <div className="pointer-events-none fixed top-0 left-1/2 -z-10 h-[500px] w-full max-w-6xl -translate-x-1/2 overflow-hidden opacity-40 blur-3xl">
        <div className="absolute -top-32 left-1/4 h-80 w-80 rounded-full bg-ocean-600/20" />
        <div className="absolute top-10 right-1/4 h-96 w-96 rounded-full bg-ocean-300/15" />
      </div>

      <PublicHeader currentPath={currentPath} />

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {children}
      </main>

      {!hideFooter && <PublicFooter />}
    </div>
  );
}
