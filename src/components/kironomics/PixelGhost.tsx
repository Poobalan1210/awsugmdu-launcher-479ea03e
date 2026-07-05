import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

/**
 * 8-bit pixel-art ghost rendered as crisp SVG rects.
 * Matches the Kironomics brand mark (rounded violet ghost with glowing eyes).
 */
export function PixelGhost({
  size = 120,
  className = '',
  glow = true,
}: {
  size?: number;
  className?: string;
  glow?: boolean;
}) {
  // 14x16 pixel grid. 1 = body, 2 = eye (white), 0 = transparent.
  const grid = [
    '00001111110000',
    '00011111111000',
    '00111111111100',
    '01111111111110',
    '01111111111110',
    '01122111122110',
    '11122111122111',
    '11122111122111',
    '11122111122111',
    '11111111111111',
    '11111111111111',
    '11111111111111',
    '11111111111111',
    '11111111111111',
    '11011011011011',
    '10010010010010',
  ];
  const cell = size / 14;
  const body = '#8b5cf6';
  const bodyEdge = '#a78bfa';
  const eye = '#f5f3ff';

  return (
    <svg
      width={size}
      height={(size / 14) * 16}
      viewBox={`0 0 ${size} ${(size / 14) * 16}`}
      className={className}
      style={{
        imageRendering: 'pixelated',
        filter: glow ? 'drop-shadow(0 0 14px rgba(139,92,246,0.85))' : undefined,
        shapeRendering: 'crispEdges',
      }}
      aria-hidden="true"
    >
      {grid.flatMap((row, y) =>
        row.split('').map((c, x) => {
          if (c === '0') return null;
          const isEdge = y <= 4;
          const fill = c === '2' ? eye : isEdge ? bodyEdge : body;
          return (
            <rect
              key={`${x}-${y}`}
              x={x * cell}
              y={y * cell}
              width={cell + 0.5}
              height={cell + 0.5}
              fill={fill}
            />
          );
        }),
      )}
    </svg>
  );
}

/**
 * A ghost that drifts across the screen and fades in/out — "comes and goes".
 */
export function RoamingGhost({
  size = 48,
  top,
  duration = 16,
  delay = 0,
  reverse = false,
}: {
  size?: number;
  top: string;
  duration?: number;
  delay?: number;
  reverse?: boolean;
}) {
  return (
    <motion.div
      className="pointer-events-none absolute z-0"
      style={{ top }}
      initial={{ x: reverse ? '105vw' : '-15vw', opacity: 0 }}
      animate={{
        x: reverse ? '-15vw' : '105vw',
        opacity: [0, 0.5, 0.7, 0.5, 0],
        y: [0, -18, 0, 18, 0],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'linear',
        opacity: { duration, delay, repeat: Infinity, times: [0, 0.15, 0.5, 0.85, 1] },
        y: { duration: duration / 4, repeat: Infinity, ease: 'easeInOut' },
      }}
    >
      <div style={{ transform: reverse ? 'scaleX(-1)' : undefined }}>
        <PixelGhost size={size} />
      </div>
    </motion.div>
  );
}

/**
 * Drifting fog/mist banks for atmosphere. Pure CSS radial blobs that slide.
 */
export function GhostFog() {
  const banks = [
    { top: '12%', size: 420, dur: 46, delay: 0, opacity: 0.10 },
    { top: '55%', size: 540, dur: 64, delay: 8, opacity: 0.08 },
    { top: '78%', size: 360, dur: 52, delay: 4, opacity: 0.12 },
  ];
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      {banks.map((b, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-3xl"
          style={{
            top: b.top,
            width: b.size,
            height: b.size * 0.5,
            background:
              'radial-gradient(ellipse at center, rgba(167,139,250,0.55), transparent 70%)',
            opacity: b.opacity,
          }}
          initial={{ x: '-30vw' }}
          animate={{ x: '110vw' }}
          transition={{ duration: b.dur, delay: b.delay, repeat: Infinity, ease: 'linear' }}
        />
      ))}
    </div>
  );
}

/**
 * Floating spirit orbs (soul wisps) rising slowly upward.
 */
export function FloatingSpirits({ count = 22 }: { count?: number }) {
  const orbs = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        left: `${Math.random() * 100}%`,
        size: 2 + Math.random() * 4,
        dur: 9 + Math.random() * 12,
        delay: Math.random() * 10,
        drift: (Math.random() - 0.5) * 60,
      })),
    [count],
  );
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      {orbs.map((o, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            left: o.left,
            bottom: -10,
            width: o.size,
            height: o.size,
            background: 'rgba(196,181,253,0.9)',
            boxShadow: '0 0 8px rgba(167,139,250,0.9)',
          }}
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: '-110vh', x: o.drift, opacity: [0, 0.9, 0.9, 0] }}
          transition={{ duration: o.dur, delay: o.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

/**
 * Pixel skyline silhouette — clouds, hills and a haunted tower — at the
 * bottom of the hero, echoing the poster artwork.
 */
export function PixelSkyline() {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-[2] pointer-events-none">
      <svg viewBox="0 0 1200 200" preserveAspectRatio="none" className="w-full h-[180px]" aria-hidden="true">
        {/* far hills */}
        <path d="M0,200 L0,150 L120,120 L260,150 L400,110 L560,150 L720,120 L880,150 L1040,115 L1200,150 L1200,200 Z" fill="#1a1030" opacity="0.9" />
        {/* near hills */}
        <path d="M0,200 L0,175 L160,160 L320,180 L480,158 L640,178 L820,160 L1000,180 L1200,162 L1200,200 Z" fill="#120a24" />
        {/* haunted tower on the right */}
        <g fill="#1d1138">
          <rect x="980" y="70" width="48" height="100" />
          <rect x="972" y="64" width="64" height="10" />
          <polygon points="980,70 1004,40 1028,70" />
          <rect x="992" y="92" width="10" height="16" fill="#7c3aed" opacity="0.8" />
          <rect x="1008" y="92" width="10" height="16" fill="#7c3aed" opacity="0.8" />
          <rect x="998" y="120" width="14" height="50" fill="#0a0612" />
        </g>
        {/* small tower on the left */}
        <g fill="#1d1138">
          <rect x="150" y="110" width="34" height="60" />
          <polygon points="150,110 167,86 184,110" />
          <rect x="160" y="124" width="8" height="12" fill="#7c3aed" opacity="0.7" />
        </g>
      </svg>
    </div>
  );
}

/**
 * A tiny ghost that softly trails the cursor across the arcade.
 */
export function CursorGhost() {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: -100, y: -100 });
  const target = useRef({ x: -100, y: -100 });
  const [active, setActive] = useState(false);

  useEffect(() => {
    // Skip on touch / coarse pointers.
    if (window.matchMedia?.('(pointer: coarse)').matches) return;

    const onMove = (e: MouseEvent) => {
      target.current = { x: e.clientX, y: e.clientY };
      if (!active) setActive(true);
    };
    window.addEventListener('mousemove', onMove);

    let raf = 0;
    const tick = () => {
      pos.current.x += (target.current.x - pos.current.x) * 0.08;
      pos.current.y += (target.current.y - pos.current.y) * 0.08;
      if (ref.current) {
        ref.current.style.transform = `translate(${pos.current.x + 18}px, ${pos.current.y + 18}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [active]);

  return (
    <div
      ref={ref}
      className="fixed top-0 left-0 z-50 pointer-events-none transition-opacity duration-500"
      style={{ opacity: active ? 0.55 : 0 }}
      aria-hidden="true"
    >
      <PixelGhost size={22} />
    </div>
  );
}
