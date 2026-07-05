import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Globe, Menu, X } from 'lucide-react';
import { PixelGhost } from './PixelGhost';

const NAV_LINKS = [
  { label: 'Leaderboard', id: 'leaderboard' },
  { label: 'How to Join', id: 'install' },
  { label: 'Privacy', id: 'privacy' },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Pixel-arcade top bar for the Kironomics world. Replaces the global site
 * Header on this page so the theme stays fully immersive.
 */
export function KironomicsNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const go = (id: string) => {
    scrollTo(id);
    setMenuOpen(false);
  };

  return (
    <header
      className={`sticky top-0 z-40 w-full transition-colors duration-300 ${
        scrolled ? 'bg-[#0a0612]/90 backdrop-blur border-b border-violet-500/30' : 'bg-transparent'
      }`}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Brand */}
        <button onClick={() => scrollTo('top')} className="flex items-center gap-3 group">
          <span className="kiro-float">
            <PixelGhost size={30} />
          </span>
          <span className="font-pixel text-[11px] sm:text-sm text-violet-100 kiro-text-glow group-hover:text-white transition-colors">
            KIRONOMICS
          </span>
        </button>

        {/* Desktop links */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((l) => (
            <button
              key={l.id}
              onClick={() => go(l.id)}
              className="font-pixel text-[9px] text-violet-300 hover:text-white px-3 py-2 rounded hover:bg-violet-500/15 transition-colors uppercase tracking-wide"
            >
              {l.label}
            </button>
          ))}
          <Link
            to="/"
            className="font-pixel text-[9px] text-violet-200 ml-2 px-3 py-2 rounded border border-violet-500/40 hover:bg-violet-500/15 hover:text-white transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft className="h-3 w-3" />
            AWS UG
          </Link>
        </nav>

        {/* Mobile toggle */}
        <button
          className="md:hidden h-9 w-9 grid place-items-center rounded text-violet-200 hover:bg-violet-500/15"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Menu"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-violet-500/30 bg-[#0a0612]/95 backdrop-blur">
          <nav className="container mx-auto px-4 py-3 flex flex-col gap-1">
            {NAV_LINKS.map((l) => (
              <button
                key={l.id}
                onClick={() => go(l.id)}
                className="font-pixel text-[10px] text-violet-300 hover:text-white px-3 py-3 rounded hover:bg-violet-500/15 transition-colors text-left uppercase"
              >
                {l.label}
              </button>
            ))}
            <Link
              to="/"
              className="font-pixel text-[10px] text-violet-200 px-3 py-3 rounded border border-violet-500/40 hover:bg-violet-500/15 hover:text-white transition-colors flex items-center gap-2 mt-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to AWS UG Madurai
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

/**
 * Pixel-arcade footer echoing the poster's bottom strip.
 */
export function KironomicsFooter() {
  return (
    <footer className="relative z-10 border-t border-violet-500/25 bg-[#080410]">
      <div className="container mx-auto px-4 py-10 text-center">
        <div className="kiro-float inline-block mb-4">
          <PixelGhost size={40} />
        </div>

        {/* URL bar like the poster */}
        <div className="max-w-md mx-auto mb-6">
          <div className="font-pixel text-[9px] sm:text-[10px] text-violet-100 border border-violet-500/50 rounded-md px-4 py-3 bg-violet-500/10 flex items-center justify-center gap-2 kiro-pixel-border">
            <Globe className="h-3.5 w-3.5 text-violet-300" />
            WWW.AWSUGMDU.IN/KIRONOMICS
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mb-6">
          {NAV_LINKS.map((l) => (
            <button
              key={l.id}
              onClick={() => scrollTo(l.id)}
              className="font-retro text-lg text-violet-300/80 hover:text-violet-100 transition-colors uppercase"
            >
              {l.label}
            </button>
          ))}
          <Link to="/" className="font-retro text-lg text-violet-300/80 hover:text-violet-100 transition-colors uppercase">
            AWS UG Madurai
          </Link>
        </div>

        <p className="font-retro text-xl text-violet-300/80">♥ Build more. Ship faster. Together. ♥</p>
        <p className="font-pixel text-[8px] text-violet-500/60 mt-3">
          POWERED BY AWS USER GROUP MADURAI × KIRO
        </p>
      </div>
    </footer>
  );
}
