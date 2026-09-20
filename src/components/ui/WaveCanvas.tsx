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

    function resize() {
      if (!canvas || !ctx) return;
      dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      
      ctx.scale(dpr, dpr);
    }

    window.addEventListener('resize', resize);
    resize();

    function draw() {
      if (!ctx) return;
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = 1;

      const lineCount = 35; // Density of lines
      const startY = h * 0.55; // Keep top 50% clear for hero text

      for (let i = 0; i < lineCount; i++) {
        ctx.beginPath();
        const offset = (i / lineCount) * 120;

        for (let x = 0; x <= w; x += 10) {
          // Compound sine waves to mimic fluid mesh oscillation
          const y = startY 
            + Math.sin(x * 0.003 + t + i * 0.05) * 45
            + Math.cos(x * 0.0015 - t * 0.8 + offset * 0.02) * 35
            + offset;

          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      t += 0.008; // Control speed (lower = slower/smoother)
      animationFrameId = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute bottom-0 left-0 w-full h-full z-[1] pointer-events-none"
    />
  );
}
