import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PixelGhost, GhostFog, FloatingSpirits } from './PixelGhost';

/**
 * A short ghostly arcade intro that plays before the Kironomics landing page.
 *
 * Phases:
 *  0 — a ghost rises from the dark, eyes glowing, rings pulsing
 *  1 — the KIRONOMICS title reveals
 *  2 — "BOO!" + the ghost rushes the screen, a flash wipes to the page
 */
export function KironomicsIntro({ onFinish }: { onFinish: () => void }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),
      setTimeout(() => setPhase(2), 2400),
      setTimeout(() => onFinish(), 3300),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onFinish]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] overflow-hidden flex flex-col items-center justify-center"
      style={{ background: '#060310' }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* ambient */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(circle at 50% 45%, rgba(139,92,246,0.25), transparent 60%)',
      }} />
      <GhostFog />
      <FloatingSpirits count={16} />

      {/* Ghost */}
      <motion.div
        className="relative z-10"
        initial={{ y: 140, opacity: 0, scale: 0.9 }}
        animate={
          phase >= 2
            ? { y: -40, opacity: 0, scale: 7 }
            : { y: [0, -16, 0], opacity: 1, scale: 1 }
        }
        transition={
          phase >= 2
            ? { duration: 0.85, ease: 'easeIn' }
            : { y: { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 0.9 }, scale: { duration: 0.9 } }
        }
      >
        {/* pulsing rings */}
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-56 w-56 rounded-full border-2 border-violet-500/30 kiro-pulse-ring" />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-56 w-56 rounded-full border-2 border-violet-500/20 kiro-pulse-ring" style={{ animationDelay: '1s' }} />
        <PixelGhost size={170} />

        {/* BOO speech bubble */}
        {phase >= 1 && phase < 2 && (
          <motion.div
            initial={{ scale: 0, rotate: -8, opacity: 0 }}
            animate={{ scale: 1, rotate: -8, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 12 }}
            className="absolute -right-10 -top-6 font-pixel text-sm text-violet-950 bg-violet-200 px-3 py-2 rounded kiro-pixel-border"
          >
            BOO!
          </motion.div>
        )}
      </motion.div>

      {/* Title */}
      <motion.div
        className="relative z-10 text-center mt-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: phase >= 1 && phase < 2 ? 1 : phase >= 2 ? 0 : 0, y: phase >= 1 ? 0 : 20 }}
        transition={{ duration: 0.5 }}
      >
        <h1
          className="font-pixel text-2xl sm:text-4xl text-transparent bg-clip-text kiro-text-glow"
          style={{ backgroundImage: 'linear-gradient(180deg,#ede9fe 0%,#a78bfa 55%,#7c3aed 100%)' }}
        >
          KIRONOMICS
        </h1>
        <p className="font-pixel text-[8px] sm:text-[10px] text-violet-300/80 mt-4 tracking-widest">
          THE KIRO USAGE LEADERBOARD
        </p>
      </motion.div>

      {/* Flash wipe on rush */}
      {phase >= 2 && (
        <motion.div
          className="absolute inset-0 bg-violet-200"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.85, 0] }}
          transition={{ duration: 0.85, times: [0, 0.5, 1] }}
        />
      )}

      {/* Skip */}
      <button
        onClick={onFinish}
        className="absolute bottom-6 right-6 z-20 font-pixel text-[9px] text-violet-300/70 hover:text-violet-100 border border-violet-500/30 hover:border-violet-400/60 rounded px-3 py-2 transition-colors"
      >
        SKIP ▸
      </button>

      <p className="absolute bottom-7 left-1/2 -translate-x-1/2 z-10 font-pixel text-[8px] text-violet-400/50 tracking-widest hidden sm:block">
        AWS USER GROUP MADURAI × KIRO
      </p>
    </motion.div>
  );
}
