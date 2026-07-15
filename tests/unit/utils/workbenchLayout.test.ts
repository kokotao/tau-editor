import { describe, expect, it } from 'vitest';
import { resolveWorkbenchSidebarVisibility } from '@/utils/workbenchLayout';

describe('resolveWorkbenchSidebarVisibility', () => {
  it('keeps only the context rail visible after a desktop workbench shrinks into 800–1023px', () => {
    expect(resolveWorkbenchSidebarVisibility({
      viewportWidth: 900,
      sidebarCollapsed: false,
      contextRailCollapsed: false,
    })).toEqual({
      fileTreeVisible: false,
      contextRailVisible: true,
    });
  });

  it('hides the context rail below 800px while preserving the explorer state', () => {
    expect(resolveWorkbenchSidebarVisibility({
      viewportWidth: 799,
      sidebarCollapsed: false,
      contextRailCollapsed: false,
    })).toEqual({
      fileTreeVisible: false,
      contextRailVisible: false,
    });
  });

  it('keeps both rails closed below 800px until their respective drawers are opened', () => {
    const input = {
      viewportWidth: 799,
      sidebarCollapsed: false,
      contextRailCollapsed: false,
    };

    expect(resolveWorkbenchSidebarVisibility({ ...input, fileTreeDrawerOpen: true })).toEqual({
      fileTreeVisible: true,
      contextRailVisible: false,
    });
    expect(resolveWorkbenchSidebarVisibility({ ...input, contextRailDrawerOpen: true })).toEqual({
      fileTreeVisible: false,
      contextRailVisible: true,
    });
  });

  it('renders the 800–1023px explorer as an overlay drawer and keeps it mutually exclusive with Context Rail', () => {
    const input = {
      viewportWidth: 900,
      sidebarCollapsed: false,
      contextRailCollapsed: false,
    };

    expect(resolveWorkbenchSidebarVisibility(input)).toEqual({
      fileTreeVisible: false,
      contextRailVisible: true,
    });
    expect(resolveWorkbenchSidebarVisibility({
      ...input,
      contextRailCollapsed: true,
      fileTreeDrawerOpen: true,
    })).toEqual({
      fileTreeVisible: true,
      contextRailVisible: false,
    });
  });

  it('keeps the Context Rail closed by default below 800px but opens it as a drawer on demand', () => {
    const input = {
      viewportWidth: 799,
      sidebarCollapsed: false,
      contextRailCollapsed: false,
    };

    expect(resolveWorkbenchSidebarVisibility(input)).toEqual({
      fileTreeVisible: false,
      contextRailVisible: false,
    });
    expect(resolveWorkbenchSidebarVisibility({ ...input, contextRailDrawerOpen: true })).toEqual({
      fileTreeVisible: false,
      contextRailVisible: true,
    });
  });

  it('keeps the 1024–1279px Context Rail closed by default and opens it as an on-demand drawer', () => {
    const input = {
      viewportWidth: 1100,
      sidebarCollapsed: false,
      contextRailCollapsed: false,
    };

    expect(resolveWorkbenchSidebarVisibility(input)).toEqual({
      fileTreeVisible: true,
      contextRailVisible: false,
    });
    expect(resolveWorkbenchSidebarVisibility({ ...input, contextRailDrawerOpen: true })).toEqual({
      fileTreeVisible: true,
      contextRailVisible: true,
    });
  });

  it('keeps both persisted panels available in the >=1280px three-column layout', () => {
    expect(resolveWorkbenchSidebarVisibility({
      viewportWidth: 1280,
      sidebarCollapsed: false,
      contextRailCollapsed: false,
    })).toEqual({
      fileTreeVisible: true,
      contextRailVisible: true,
    });
  });
});
