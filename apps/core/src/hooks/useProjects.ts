/**
 * DEPRECATED: This hook is a temporary stub.
 * Projects have been removed in favor of environment-based organization.
 * TODO: Update all components to use environment filtering instead.
 */

export function useProjects({ initialProjectId }: { initialProjectId?: string } = {}) {
  return {
    projects: [],
    selectedProjectId: null,
    setSelectedProjectId: () => {},
  };
}
