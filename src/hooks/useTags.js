import { useState, useEffect, useCallback } from 'react';

export function useTags(repoName) {
  const storageKey = `beckarepo_tags_${repoName || 'default'}`;
  const [tagsData, setTagsData] = useState({});

  // Carrega ao iniciar
  useEffect(() => {
    if (!repoName) return;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try { setTagsData(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, [repoName, storageKey]);

  // Salva no localStorage
  const save = useCallback((newData) => {
    setTagsData(newData);
    localStorage.setItem(storageKey, JSON.stringify(newData));
  }, [storageKey]);

  const addTag = useCallback((filePath, tag) => {
    const current = tagsData[filePath] || { tags: [], note: '' };
    if (!current.tags.includes(tag)) {
      save({ ...tagsData, [filePath]: { ...current, tags: [...current.tags, tag] } });
    }
  }, [tagsData, save]);

  const removeTag = useCallback((filePath, tag) => {
    const current = tagsData[filePath];
    if (current) {
      const newTags = current.tags.filter(t => t !== tag);
      save({ ...tagsData, [filePath]: { ...current, tags: newTags } });
    }
  }, [tagsData, save]);

  const setNote = useCallback((filePath, note) => {
    const current = tagsData[filePath] || { tags: [], note: '' };
    save({ ...tagsData, [filePath]: { ...current, note } });
  }, [tagsData, save]);

  return { tagsData, addTag, removeTag, setNote };
}