import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    const update = () => setMatches(mediaQueryList.matches);
    update();

    // 'change' es el evento correcto, pero se agrega 'resize' como
    // respaldo: algunos entornos de emulacion (herramientas de
    // automatizacion, ciertos WebViews) cambian las metricas del viewport
    // sin disparar 'change' en un MediaQueryList ya existente.
    mediaQueryList.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      mediaQueryList.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, [query]);

  return matches;
}
