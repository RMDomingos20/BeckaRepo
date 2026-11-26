import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

const EMPTY = { tags: [], note: '', revision: 0 };
const fresh = scope => ({ scope, saved: {}, drafts: {}, errors: {}, saving: {} });

// Drafts stay in the parent while navigating files, tabs, and refreshing the graph.
export function useTags(worktreeId, snapshotId, legacyKey, path) {
  const [state, setState] = useState(() => fresh(''));
  const [load, setLoad] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const current = state.scope === worktreeId ? state : fresh(worktreeId);
  const saved = current.saved[path];
  const draft = current.drafts[path];
  const dirty = Boolean(draft);
  const annotation = draft || saved || EMPTY;
  const hasUnsaved = Object.keys(current.drafts).length > 0 || Object.values(current.saving).some(Boolean);

  useEffect(() => {
    if (!snapshotId || !worktreeId || !path) return;
    let disposed = false;
    const update = fn => setState(old => fn(old.scope === worktreeId ? old : fresh(worktreeId)));
    const run = async () => {
      let migrationError = '';
      try {
        // Keep the original LocalStorage value; the native transaction records completion.
        const source = `beckarepo_tags_${legacyKey}`;
        const data = localStorage.getItem(source);
        if (data) {
          try {
            if (new TextEncoder().encode(data).length > 4 * 1024 * 1024) throw new Error('Legacy annotations exceed 4 MiB');
            await invoke('import_annotations', { snapshotId, source, data });
          } catch (error) { migrationError = String(error); }
        }
        const value = await invoke('load_annotations', { snapshotId, path });
        if (!disposed) {
          update(old => ({ ...old, saved: { ...old.saved, [path]: value } }));
          setLoad({ worktreeId, snapshotId, path, attempt, ready: true, error: migrationError });
        }
      } catch (error) {
        if (!disposed) setLoad({ worktreeId, snapshotId, path, attempt, ready: false, error: String(error) });
      }
    };
    run();
    return () => { disposed = true; };
  }, [snapshotId, worktreeId, legacyKey, path, attempt]);

  // Missing IDs can compare equal during startup; only a real, current load is usable.
  const currentLoad = worktreeId && snapshotId && path && load
    && load.worktreeId === worktreeId && load.snapshotId === snapshotId
    && load.path === path && load.attempt === attempt ? load : null;
  const ready = currentLoad?.ready === true;
  const loadError = currentLoad?.error || '';
  const edit = patch => {
    if (!ready || current.saving[path]) return;
    setState(old => {
      const value = old.scope === worktreeId ? old : fresh(worktreeId);
      return { ...value, errors: { ...value.errors, [path]: '' }, drafts: {
        ...value.drafts, [path]: { ...(value.drafts[path] || value.saved[path] || EMPTY), ...patch },
      } };
    });
  };
  const save = async () => {
    if (!ready || !dirty || current.saving[path]) return;
    setState(old => ({ ...old, saving: { ...old.saving, [path]: true }, errors: { ...old.errors, [path]: '' } }));
    try {
      const value = await invoke('save_annotation', { snapshotId, path, annotation });
      setState(old => {
        if (old.scope !== worktreeId) return old;
        const drafts = { ...old.drafts };
        delete drafts[path];
        return { ...old, drafts, saved: { ...old.saved, [path]: value }, saving: { ...old.saving, [path]: false } };
      });
    } catch (error) {
      setState(old => old.scope !== worktreeId ? old : ({ ...old,
        saving: { ...old.saving, [path]: false }, errors: { ...old.errors, [path]: String(error) } }));
    }
  };
  const discard = () => {
    if (!ready || current.saving[path]) return;
    setState(old => {
      if (old.scope !== worktreeId) return old;
      const drafts = { ...old.drafts }; delete drafts[path];
      return { ...old, drafts, errors: { ...old.errors, [path]: '' } };
    });
  };
  return { annotation, edit, save, discard, dirty, hasUnsaved, ready,
    unsavedPaths: Object.keys(current.drafts), reload: () => setAttempt(value => value + 1),
    saving: Boolean(current.saving[path]), error: loadError || current.errors[path] || '' };
}
