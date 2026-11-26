import { useRef, useState } from 'react';
import { theme as T } from '../styles/theme.js';

export function ImagePreview({ url, name, hint }) {
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const pointer = useRef(null);
  const stop = () => { pointer.current = null; setDragging(false); };
  return <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none' }}
    onWheel={event => setView(current => ({ ...current, s: Math.max(0.1, Math.min(10, current.s - event.deltaY * 0.005)) }))}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      pointer.current = { x: event.clientX, y: event.clientY }; setDragging(true);
    }}
    onPointerMove={event => {
      if (!pointer.current) return;
      const dx = event.clientX - pointer.current.x, dy = event.clientY - pointer.current.y;
      pointer.current = { x: event.clientX, y: event.clientY };
      setView(current => ({ ...current, x: current.x + dx, y: current.y + dy }));
    }} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}>
    <img src={url} alt={name} draggable={false} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, transition: dragging ? 'none' : 'transform 0.1s ease-out', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4, pointerEvents: 'none' }} />
    <div style={{ position: 'absolute', bottom: 10, right: 10, background: T.bgDeep, padding: '3px 8px', borderRadius: 4, fontSize: 11, color: T.textMid, pointerEvents: 'none', border: `1px solid ${T.border}` }}>{hint}</div>
  </div>;
}
