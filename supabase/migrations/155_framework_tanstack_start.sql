-- Allow the TanStack Start framework value (Lovable-parity default) and the
-- other framework strings the app already uses (react-native, nextjs) on
-- projects.framework. The original 001 constraint only allowed
-- react/next/vue/svelte, which would reject "tanstack-start" inserts.

alter table public.projects drop constraint if exists projects_framework_check;

alter table public.projects
  add constraint projects_framework_check
  check (framework in (
    'react', 'next', 'nextjs', 'vue', 'svelte',
    'react-native', 'tanstack-start', 'tanstack'
  ));
