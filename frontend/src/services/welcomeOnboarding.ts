export interface WelcomeLaunchState {
  previousVersion: string | null;
  currentVersion: string | null;
  lastOpenedAt: number | null;
  now: number;
  reopenIntervalMs: number;
}

export function shouldShowWelcomePackageOnLaunch(state: WelcomeLaunchState): boolean {
  if (!state.previousVersion) {
    return true;
  }
  if (state.currentVersion && state.previousVersion !== state.currentVersion) return true;
  if (!state.lastOpenedAt) return true;
  return state.now - state.lastOpenedAt >= state.reopenIntervalMs;
}
