import { useCallback, useState } from 'react';

/** Delay that lets a screen reader notice that the text changed, also when the same text comes twice. */
const ANNOUNCE_DELAY_MS = 60;

/** The text of a polite live region and the function that announces something through it. */
export function useAnnouncer(): readonly [string, (text: string) => void] {
  const [text, setText] = useState('');
  const announce = useCallback((next: string): void => {
    setText('');
    setTimeout(() => setText(next), ANNOUNCE_DELAY_MS);
  }, []);
  return [text, announce];
}
