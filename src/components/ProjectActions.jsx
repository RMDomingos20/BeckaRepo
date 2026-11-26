import { useEffect, useRef } from 'react';
import { useTranslation } from '../hooks/useTranslation';

export function ProjectActions({ actions }) {
  const { lang } = useTranslation();
  const menu = useRef(null);
  useEffect(() => {
    const outside = event => { if (!menu.current?.contains(event.target) && menu.current) menu.current.open = false; };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  return <details ref={menu} className="project-actions" onKeyDown={event => {
    if (event.key === 'Escape') { menu.current.open = false; menu.current.firstElementChild.focus(); }
  }}>
    <summary className="br-btn">{lang === 'pt' ? 'Projeto' : 'Project'} <span aria-hidden="true">▾</span></summary>
    <div>{actions.map(([label, action]) => <button key={label} onClick={() => {
      menu.current.open = false;
      menu.current.firstElementChild.focus();
      action();
    }}>{label}</button>)}</div>
  </details>;
}