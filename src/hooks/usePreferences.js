import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';

export function usePreferences() {
  const [preferences, setPreferences] = useState({ language: localStorage.getItem('becka_lang') === 'en' ? 'en' : 'pt' });
  const [ready, setReady] = useState(false);
  const [errors, setErrors] = useState({});
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    let disposed = false;
    if (!isTauri()) { Promise.resolve().then(() => { if (!disposed) setReady(true); }); return () => { disposed = true; }; }
    invoke('get_preferences', { legacyLanguage: localStorage.getItem('becka_lang') }).then(values => {
      if (!disposed) { setPreferences(old => ({ ...old, ...values })); setReady(true); }
    }).catch(reason => { if (!disposed) { setErrors({ load: String(reason) }); setReady(true); } });
    return () => { disposed = true; };
  }, []);
  const setPreference = useCallback((key, value) => {
    setPreferences(old => ({ ...old, [key]: value }));
    if (!isTauri()) return;
    queue.current = queue.current.then(() => invoke('set_preference', { key, value }))
      .then(() => setErrors(old => { const next = { ...old }; delete next[key]; return next; }))
      .catch(reason => setErrors(old => ({ ...old, [key]: String(reason) })));
  }, []);
  return { preferences, setPreference, preferencesReady: ready, preferencesError: Object.values(errors).join(' ') };
}
