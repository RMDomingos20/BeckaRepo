import { useEffect, useRef, useState } from 'react';
import { searchRepository, cancelSearch } from '../services/analysisClient.js';

const EMPTY_HITS = [];
const EMPTY = { hits: EMPTY_HITS, busy: false, error: '', scanned: 0, total: 0, searchedText: 0, skippedText: 0, changed: 0, unreadable: 0, hasMore: false, capped: false };
const MAX_HITS = 2000;
let sequence = 0;

export function useRepositorySearch(snapshotId, query) {
  const [result, setResult] = useState(EMPTY);
  const jobRef = useRef(null);
  useEffect(() => {
    if (!snapshotId || query.length < 2) return;
    const job = { snapshotId, query, queryId: `${Date.now()}-${++sequence}`, cursor: 0, cancelled: false, running: false, state: { ...EMPTY, snapshotId, query, total: 0, hits: [], hasMore: true } };
    let visibleHits = [];
    const publish = () => {
      if (job.cancelled) return;
      if (visibleHits.length !== job.state.hits.length) visibleHits = [...job.state.hits];
      setResult({ ...job.state, hits: visibleHits });
    };
    job.run = async () => {
      if (job.running || job.cancelled || job.cursor === null || job.state.hits.length >= MAX_HITS) return;
      job.running = true;
      job.state.busy = true;
      publish();
      const target = Math.min(MAX_HITS, job.state.hits.length + 200);
      try {
        while (!job.cancelled && job.cursor !== null && job.state.hits.length < target) {
          const page = await searchRepository(snapshotId, job.queryId, query, job.cursor, target - job.state.hits.length);
          if (job.cancelled) return;
          job.cursor = page.nextCursor;
          job.state.hits.push(...page.hits);
          job.state.scanned = page.scanned;
          job.state.total = page.total;
          for (const key of ['searchedText', 'skippedText', 'changed', 'unreadable']) job.state[key] += page[key];
          job.state.hasMore = job.cursor !== null;
          job.state.capped = job.state.hits.length >= MAX_HITS && job.state.hasMore;
          publish();
        }
      } catch (error) {
        if (!job.cancelled) job.state.error = String(error);
      } finally {
        job.running = false;
        job.state.busy = false;
        publish();
      }
    };
    jobRef.current = job;
    // Start outside the synchronous effect; cleanup also handles StrictMode remounts.
    Promise.resolve().then(() => job.run());
    return () => { job.cancelled = true; cancelSearch(job.queryId).catch(() => {}); if (jobRef.current === job) jobRef.current = null; };
  }, [snapshotId, query]);
  const current = result.snapshotId === snapshotId && result.query === query ? result : { ...EMPTY, busy: !!snapshotId && query.length >= 2 };
  return { ...current, loadMore: () => jobRef.current?.run() };
}
