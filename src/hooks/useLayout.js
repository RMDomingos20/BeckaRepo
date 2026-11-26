import { useTranslation } from './useTranslation';

export function useLayout() {
  const { preferences, setPreference, preferencesReady } = useTranslation();
  const showTree = preferences.showTree !== 'false';
  const showDetail = preferences.showDetail !== 'false';
  const toggleTree = () => { if (preferencesReady) setPreference('showTree', String(!showTree)); };
  const toggleDetail = () => { if (preferencesReady) setPreference('showDetail', String(!showDetail)); };
  return { showTree, showDetail, toggleTree, toggleDetail };
}
