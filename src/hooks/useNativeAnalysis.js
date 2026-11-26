import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useNativeAnalysis(command, cancelCommand, args) {
  const [result, setResult] = useState(null);
  const [generation, setGeneration] = useState(0);
  const jobRef = useRef(null);
  const serialized = JSON.stringify(args);
  const key = JSON.stringify([command, serialized, generation]);
  useEffect(() => {
    const job = { id: crypto.randomUUID(), cancelled: false };
    jobRef.current = job;
    const request = JSON.parse(serialized);
    invoke(command, { ...request, queryId: job.id, ...(command.startsWith('git_') ? { force: generation > 0 } : {}) })
      .then(data => {
        if (!job.cancelled && data.queryId === job.id && data.snapshotId === request.snapshotId) setResult({ key, data });
      }).catch(error => { if (!job.cancelled) setResult({ key, error: String(error) }); });
    return () => {
      job.cancelled = true;
      invoke(cancelCommand, { queryId: job.id }).catch(() => {});
      if (jobRef.current === job) jobRef.current = null;
    };
  }, [command, cancelCommand, serialized, generation, key]);
  const cancel = () => {
    const job = jobRef.current;
    if (!job) return;
    job.cancelled = true;
    setResult({ key, cancelled: true });
    invoke(cancelCommand, { queryId: job.id }).catch(error => {
      if (jobRef.current === job) setResult({ key, error: String(error) });
    });
  };
  return { ...(result?.key === key ? result : { busy: true }), cancel, reload: () => setGeneration(value => value + 1) };
}
