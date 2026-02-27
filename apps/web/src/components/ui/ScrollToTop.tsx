'use client';

import { useEffect, useState } from 'react';
import { ChevronUp } from 'lucide-react';

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;

    function onScroll() {
      setVisible((main as HTMLElement).scrollTop > 400);
    }
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => {
        const main = document.querySelector('main');
        main?.scrollTo({ top: 0, behavior: 'smooth' });
      }}
      className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full bg-dark-800 border border-dark-600 text-dark-300 hover:text-white hover:bg-dark-700 hover:border-dark-500 shadow-lg transition-all duration-200 flex items-center justify-center animate-fade-in"
      title="Voltar ao topo"
      aria-label="Voltar ao topo"
    >
      <ChevronUp size={18} />
    </button>
  );
}
