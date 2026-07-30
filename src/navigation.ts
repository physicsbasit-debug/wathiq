import type { ViewName } from "./types.js";

const ROUTE_BY_VIEW: Record<ViewName, string> = {
  home: "home",
  wizard: "new-exam",
  library: "exams",
  policy: "assessment-policy",
  admin: "content",
};

const VIEW_BY_ROUTE = new Map<string, ViewName>(
  Object.entries(ROUTE_BY_VIEW).map(([view, route]) => [route, view as ViewName]),
);

export function isViewName(value: string | null | undefined): value is ViewName {
  return value === "home" || value === "wizard" || value === "library" || value === "policy" || value === "admin";
}

export function viewHash(view: ViewName): string {
  return `#/${ROUTE_BY_VIEW[view]}`;
}

export function viewFromHash(hash: string): ViewName | null {
  const route = hash.trim().replace(/^#\/?/, "").split(/[?&]/, 1)[0]?.toLowerCase() ?? "";
  return VIEW_BY_ROUTE.get(route) ?? null;
}

export function resolveInitialView(hash: string, storedView: string | null): ViewName {
  return viewFromHash(hash) ?? (isViewName(storedView) ? storedView : "home");
}
