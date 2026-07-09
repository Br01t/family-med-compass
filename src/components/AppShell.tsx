import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  LayoutDashboard,
  LogOut,
  Package,
  PieChart,
  Pill,
  Settings,

  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFamilyMed } from "@/lib/store";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const nav = [
  { title: "Dashboard", url: "/caregiver", icon: LayoutDashboard },
  { title: "Pazienti", url: "/pazienti", icon: Users },
  { title: "Terapie", url: "/terapie", icon: Pill },
  { title: "Storico & Report", url: "/storico-report", icon: PieChart },
  { title: "Scorte", url: "/scorte", icon: Package },
  { title: "Notifiche", url: "/notifiche", icon: Bell },
  { title: "Guida", url: "/guida", icon: BookOpen },
  { title: "Impostazioni", url: "/impostazioni", icon: Settings },
];

function AppSidebar() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { data, user, logout } = useFamilyMed();
  const isActive = (url: string) =>
    url === "/caregiver" ? path === "/caregiver" : path.startsWith(url);

  const unreadCount = data.notifications.filter(
    (n) => !n.read && (!n.targetUserId || n.targetUserId === user?.id),
  ).length;

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate({ to: "/login", replace: true });
    }
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/60">
        <Link to="/" className="flex items-center gap-3 px-2 py-2">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lift">
            <Pill className="size-5" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-base font-black tracking-tight">FamilyMed</p>
            <p className="truncate text-[11px] uppercase tracking-widest text-muted-foreground">
              Caregiver
            </p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigazione</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => {
                const showBadge = item.url === "/notifiche" && unreadCount > 0;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                    >
                      <Link to={item.url} className="relative flex items-center gap-3">
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                        {showBadge && (
                          <span className="ml-auto grid min-w-5 h-5 place-items-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:right-1 group-data-[collapsible=icon]:top-1 group-data-[collapsible=icon]:ml-0">
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/60">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2 group-data-[collapsible=icon]:hidden">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary font-bold">
            {data.caregivers.find((c) => c.id === data.currentCaregiverId)?.name.slice(0, 1) ?? "E"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {data.caregivers.find((c) => c.id === data.currentCaregiverId)?.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">Caregiver</p>
          </div>
        </div>
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start group-data-[collapsible=icon]:hidden"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 size-4" />
            Esci
          </Button>
        </div>

      </SidebarFooter>
    </Sidebar>
  );
}

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const timeStr = now.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-border/60 bg-background/85 px-4 backdrop-blur-md md:px-8">
            <SidebarTrigger className="-ml-1" />
            <div className="min-w-0 flex-1">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                <div className="min-w-0">
                  <h1 className={cn("truncate text-lg font-black tracking-tight md:text-xl")}>
                    {title}
                  </h1>
                  {subtitle && (
                    <p className="truncate text-xs text-muted-foreground md:text-sm">
                      {subtitle}
                    </p>
                  )}
                </div>
                <div className="hidden shrink-0 items-center gap-4 md:flex">
                  <div className="text-right">
                    <p className="text-xs font-medium capitalize text-muted-foreground">
                      {dateStr}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {timeStr} · <span className="text-success">Live</span>
                    </p>
                  </div>
                  {actions}
                </div>
              </div>
            </div>
          </header>
          <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
