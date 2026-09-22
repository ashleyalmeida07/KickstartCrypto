'use client';

import { useEffect, useRef } from 'react';

export default function WaveCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width: number, height: number, dpr: number;
    let t = 0;
    let animationFrameId: number;
    let lastTime = 0;
    const FPS_CAP = 30; // Cap at 30fps — halves CPU vs 60fps
    const INTERVAL = 1000 / FPS_CAP;

    function resize() {
      if (!canvas || !ctx) return;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5); // Cap DPR to reduce pixel count
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    }

    window.addEventListener('resize', resize);
    resize();

    function draw(timestamp: number) {
      animationFrameId = requestAnimationFrame(draw);

      // Skip frames to stay at 30fps
      if (timestamp - lastTime < INTERVAL) return;
      lastTime = timestamp;

      if (!ctx) return;
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.lineWidth = 1;

      const lineCount = 18;  // Reduced from 35 → 18
      const startY = h * 0.55;

      for (let i = 0; i < lineCount; i++) {
        ctx.beginPath();
        const offset = (i / lineCount) * 120;

        for (let x = 0; x <= w; x += 18) { // Step 10→18: fewer draw calls per line
          const y = startY
            + Math.sin(x * 0.003 + t + i * 0.05) * 45
            + Math.cos(x * 0.0015 - t * 0.8 + offset * 0.02) * 35
            + offset;

          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      t += 0.012;
    }

    animationFrameId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ willChange: 'transform' }}
      className="absolute bottom-0 left-0 w-full h-full z-[1] pointer-events-none"
    />
  );
}
