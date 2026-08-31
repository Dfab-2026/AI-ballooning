import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw, Maximize2, MousePointer2 } from 'lucide-react';
import { API } from '../api';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export default function DrawingViewer({ drawing, balloons, setBalloons, selected, setSelected }) {
  const viewportRef = useRef(null);
  const imageRef = useRef(null);
  const [zoom, setZoom] = useState(1.15);
  const [imageSize, setImageSize] = useState({ w: 1000, h: 700 });
  const [dragging, setDragging] = useState(null);
  const [panning, setPanning] = useState(null);

  useEffect(() => {
    setZoom(1.15);
    setSelected(null);
    requestAnimationFrame(() => viewportRef.current?.scrollTo({ left: 0, top: 0 }));
  }, [drawing?.drawing_id]);

  const src = drawing ? `${API}/preview/${drawing.drawing_id}` : '';
  const scaled = useMemo(() => ({ w: imageSize.w * zoom, h: imageSize.h * zoom }), [imageSize, zoom]);

  function zoomAt(nextZoom, clientX, clientY) {
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const old = zoom;
    const next = clamp(nextZoom, 0.35, 5);
    const px = clientX ? clientX - rect.left : rect.width / 2;
    const py = clientY ? clientY - rect.top : rect.height / 2;
    const contentX = (vp.scrollLeft + px) / old;
    const contentY = (vp.scrollTop + py) / old;
    setZoom(next);
    requestAnimationFrame(() => {
      vp.scrollLeft = contentX * next - px;
      vp.scrollTop = contentY * next - py;
    });
  }

  function onWheel(e) {
    if (e.shiftKey) return;
    e.preventDefault();
    zoomAt(zoom * (e.deltaY < 0 ? 1.12 : 0.89), e.clientX, e.clientY);
  }

  function fitDrawing() {
    const vp = viewportRef.current;
    if (!vp) return;
    const x = (vp.clientWidth - 48) / imageSize.w;
    const y = (vp.clientHeight - 48) / imageSize.h;
    setZoom(clamp(Math.min(x, y), 0.35, 2));
    requestAnimationFrame(() => vp.scrollTo({ left: 0, top: 0 }));
  }

  function startBalloonDrag(e, balloon) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setSelected(balloon.number);
    setDragging({ number: balloon.number, startX: e.clientX, startY: e.clientY, x: balloon.x, y: balloon.y });
  }

  function onPointerMove(e) {
    if (dragging) {
      const dx = (e.clientX - dragging.startX) / zoom;
      const dy = (e.clientY - dragging.startY) / zoom;
      setBalloons((items) => items.map((b) => b.number === dragging.number ? { ...b, x: clamp(dragging.x + dx, 0, imageSize.w), y: clamp(dragging.y + dy, 0, imageSize.h) } : b));
      return;
    }
    if (panning) {
      const vp = viewportRef.current;
      vp.scrollLeft = panning.scrollLeft - (e.clientX - panning.x);
      vp.scrollTop = panning.scrollTop - (e.clientY - panning.y);
    }
  }

  function onPointerDown(e) {
    if (e.button !== 0 || e.target.closest('.balloon')) return;
    const vp = viewportRef.current;
    setPanning({ x: e.clientX, y: e.clientY, scrollLeft: vp.scrollLeft, scrollTop: vp.scrollTop });
    vp.setPointerCapture?.(e.pointerId);
  }

  function endPointer() { setDragging(null); setPanning(null); }

  return <div className="viewer-shell">
    <div className="viewer-toolbar">
      <div className="zoom-help"><MousePointer2 size={15}/> Wheel = zoom · Drag blank area = pan</div>
      <div className="zoom-controls">
        <button onClick={() => zoomAt(zoom / 1.15)} title="Zoom out"><Minus size={16}/></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => zoomAt(zoom * 1.15)} title="Zoom in"><Plus size={16}/></button>
        <button onClick={fitDrawing} title="Fit drawing"><Maximize2 size={16}/></button>
        <button onClick={() => setZoom(1.15)} title="Default zoom"><RotateCcw size={16}/></button>
      </div>
    </div>
    <div ref={viewportRef} className="drawing-viewport" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPointer} onPointerCancel={endPointer}>
      {drawing ? <div className="drawing-stage" style={{ width: scaled.w, height: scaled.h }}>
        <img ref={imageRef} src={src} alt={drawing.drawing_number || 'Engineering drawing'} draggable="false"
          onLoad={(e) => setImageSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          style={{ width: scaled.w, height: scaled.h }}/>
        <svg className="balloon-layer" viewBox={`0 0 ${imageSize.w} ${imageSize.h}`} style={{ width: scaled.w, height: scaled.h }}>
          {balloons.map((b) => <g key={`${b.number}-${b.text}`} className={`balloon ${selected === b.number ? 'selected' : ''}`} onPointerDown={(e) => startBalloonDrag(e, b)}>
            <line x1={b.x} y1={b.y} x2={b.target_x ?? b.x} y2={b.target_y ?? b.y}/>
            <circle cx={b.x} cy={b.y} r="18"/>
            <text x={b.x} y={b.y + 5} textAnchor="middle">{b.number}</text>
          </g>)}
        </svg>
      </div> : <div className="empty-viewer">Upload drawings to start.</div>}
    </div>
  </div>;
}
