export type UserRole =
  | "admin"
  | "president"
  | "exhibitor"
  | "staff"
  | "partner"
  | "press"
  | "visitor";

export interface RoleDefinition {
  key: UserRole;
  label: string;
  color: string;
  description: string;
  defaultPath: string;
}

export const ROLES: RoleDefinition[] = [
  { key: "admin",     label: "Administrateur", color: "red",     description: "Accès total à la plateforme",           defaultPath: "/" },
  { key: "president", label: "Président",      color: "amber",   description: "Direction et rapports stratégiques",    defaultPath: "/" },
  { key: "exhibitor", label: "Exposant",       color: "violet",  description: "Espace exposant, leads et badges",       defaultPath: "/" },
  { key: "staff",     label: "Personnel",      color: "sky",     description: "Opérations terrain et accueil",          defaultPath: "/" },
  { key: "partner",   label: "Partenaire",     color: "orange",  description: "Contenu partenaire et leads",            defaultPath: "/" },
  { key: "press",     label: "Presse",         color: "slate",   description: "Accréditation presse et programme",      defaultPath: "/" },
  { key: "visitor",   label: "Visiteur",       color: "emerald", description: "Accès tableau de bord uniquement",       defaultPath: "/" },
];

// Routes each role can access.
// "*" = unrestricted. Any other value is an explicit allowlist — matched by full path or prefix.
const ROLE_PATHS: Record<string, string[] | "*"> = {
  admin: "*",

  president: [
    "/",
    "/evenements",
    "/programme",
    "/exposants",
    "/visiteurs",
    "/leads",
    "/floor-plan",
    "/traffic",
    "/rapports",
    "/finance",
    "/marketing",
    "/badges",
  ],

  exhibitor: [
    "/",
    "/leads",
    "/badges",
    "/scanner",
    "/landing-page",
  ],

  staff: [
    "/",
    "/evenements",
    "/visiteurs",
    "/badges",
    "/scanner",
    "/traffic",
  ],

  partner: [
    "/",
    "/leads",
    "/landing-page",
  ],

  press: [
    "/",
    "/evenements",
    "/programme",
  ],

  visitor: ["/"],
};

export function canAccess(role: string | undefined | null, path: string): boolean {
  const r = (role ?? "visitor") as string;
  const allowed = ROLE_PATHS[r];
  if (allowed === undefined) return path === "/";
  if (allowed === "*") return true;
  return allowed.some((p) =>
    p === "/" ? path === "/" : path === p || path.startsWith(p + "/")
  );
}

export function getRoleDefinition(role: string | undefined | null): RoleDefinition {
  return ROLES.find((r) => r.key === role) ?? ROLES.find((r) => r.key === "visitor")!;
}

export function getAllowedPaths(role: string | undefined | null): string[] | "*" {
  const r = (role ?? "visitor") as string;
  return ROLE_PATHS[r] ?? ["/"];
}
