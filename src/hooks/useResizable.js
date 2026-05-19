import { useState, useRef, useCallback } from 'react';

export function useResizable(initial, min, max, reverse = false) {
  const [size, setSize] = useState(initial);
  const state = useRef({ dragging:false, startX:0, startSize:initial });

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    state.current.dragging = true;
    state.current.startX = e.clientX;
    state.current.startSize = size;
    const onMove = (ev) => {
      if (!state.current.dragging) return;
      const delta = ev.clientX - state.current.startX;
      setSize(Math.max(min, Math.min(max, state.current.startSize + (reverse ? -delta : delta))));
    };
    const onUp = () => {
      state.current.dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [size, min, max, reverse]);

  return [size, onMouseDown];
}