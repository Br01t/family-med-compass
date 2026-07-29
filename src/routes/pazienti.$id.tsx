import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/pazienti/$id")({
  component: () => <Outlet />,
});