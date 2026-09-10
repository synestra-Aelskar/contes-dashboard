import { useEffect, useRef, useState } from 'react';

/**
 * Champ « brouillon local, enregistré au blur » qui reste synchronisé avec la
 * valeur distante (temps réel) : si la valeur du prop change et que le champ
 * n'est PAS en cours d'édition, on adopte la nouvelle valeur. Corrige le cas
 * où le contenu tapé par l'autre personne n'apparaissait qu'après un refresh.
 */
export function useSyncedField(value) {
  const [local, setLocal] = useState(value ?? '');
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && typeof document !== 'undefined' && document.activeElement === el) return;
    setLocal(value ?? '');
  }, [value]);
  return [local, setLocal, ref];
}
