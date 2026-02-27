/**
 * DEPRECATED: This hook is a temporary stub.
 * Projects have been removed in favor of environment-based organization.
 * TODO: Update all components to use environment filtering instead.
 */

export function useProjects({ initialProjectId, autoSelectFirst }: { initialProjectId?: string; autoSelectFirst?: boolean } = {}) {
  return {
    projects: [] as Array<{ id: string; name: string }>,
    selectedProjectId: null as string | null,
    setSelectedProjectId: (_id: string | null) => {},
    loading: false,
    error: null as string | null,
  };
}
