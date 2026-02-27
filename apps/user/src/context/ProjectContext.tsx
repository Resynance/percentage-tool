'use client';

/**
 * DEPRECATED: This context is a temporary stub.
 * Projects have been removed in favor of environment-based organization.
 * TODO: Update all components to use environment filtering instead.
 */

export function useProjectContext() {
  return {
    refreshProjects: () => {},
    selectedProjectId: null,
    setSelectedProjectId: () => {},
  };
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

import React from 'react';
