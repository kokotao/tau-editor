export interface WorkbenchSidebarVisibilityInput {
  viewportWidth: number;
  sidebarCollapsed: boolean;
  contextRailCollapsed: boolean;
  fileTreeDrawerOpen?: boolean;
  contextRailDrawerOpen?: boolean;
}

export interface WorkbenchSidebarVisibility {
  fileTreeVisible: boolean;
  contextRailVisible: boolean;
}

/**
 * Resolves the visible workbench sidebars for the current responsive breakpoint.
 * At tablet width the context rail takes precedence, avoiding two competing drawers.
 */
export function resolveWorkbenchSidebarVisibility({
  viewportWidth,
  sidebarCollapsed,
  contextRailCollapsed,
  fileTreeDrawerOpen = false,
  contextRailDrawerOpen = false,
}: WorkbenchSidebarVisibilityInput): WorkbenchSidebarVisibility {
  const compactDualSidebar = viewportWidth >= 800 && viewportWidth < 1024;
  const fileTreeDrawerBreakpoint = viewportWidth < 1024;
  const contextRailDrawerBreakpoint = viewportWidth < 800 || (viewportWidth >= 1024 && viewportWidth < 1280);
  const contextRailVisible = !contextRailCollapsed && (
    contextRailDrawerBreakpoint ? contextRailDrawerOpen : viewportWidth >= 800
  );

  return {
    fileTreeVisible: !sidebarCollapsed && (
      fileTreeDrawerBreakpoint
        ? fileTreeDrawerOpen && (!compactDualSidebar || contextRailCollapsed)
        : true
    ),
    contextRailVisible,
  };
}
