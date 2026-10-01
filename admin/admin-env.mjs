// Which Supabase projects the admin may run against, and how each is labelled in the UI.
// The storefront build already guarantees Preview → DEV and Production → PROD;
// this module only refuses unknown projects and keeps labels honest.
const PROJECTS = Object.freeze({
  wfxcklglujgramasdzyr: Object.freeze({ key: "dev", label: "DEV", name: "Supabase DEV", isProduction: false }),
  fkjarsouuchjiedrrblc: Object.freeze({ key: "prod", label: "PROD", name: "Supabase PROD", isProduction: true })
});

export function resolveAdminEnvironment(runtime) {
  const ref = runtime?.supabase?.projectRef;
  const project = PROJECTS[ref];
  if (runtime?.source !== "supabase" || !project) {
    throw new Error("Адміністрування працює лише з підтвердженим проєктом Supabase (DEV або PROD).");
  }
  if (project.isProduction && runtime.environment !== "production") {
    throw new Error("Production-база доступна лише з production-збірки сайту.");
  }
  return Object.freeze({
    ...project,
    projectRef: ref,
    dashboardUrl: `https://supabase.com/dashboard/project/${ref}`
  });
}
