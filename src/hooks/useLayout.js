import { useState } from 'react';

export function useLayout() {
  const [showTree, setShowTree] = useState(true);
  const [showDetail, setShowDetail] = useState(true);

  const toggleTree = () => setShowTree(!showTree);
  const toggleDetail = () => setShowDetail(!showDetail);

  return { showTree, showDetail, toggleTree, toggleDetail };
}