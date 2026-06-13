import { useCallback, useEffect, useRef, useState } from 'react';
import { useGenImage } from '@shared/runtime';
import { useGameSave } from '@shared/save';
import { dayKey } from '../utils/dayKey';
import { newStoneRecipe } from '../utils/prompts';
import { genImageWithRetry } from '../utils/genImageWithRetry';

export interface Stone {
  url: string;       // R2 image URL
  day: string;       // local YYYY-MM-DD
  ts: number;        // unix ms
  kind: string;      // e.g. 'milky quartz'
  mood: string;      // e.g. 'water-polished smooth'
}

// A stone you kept from someone else's tide entry. Snapshot of the original
// (url/kind/mood + author profile at keep time) so the entry survives even if
// the author deletes their save or changes name. Author profile re-hydrates
// at render time when available.
export interface KeptStone {
  url: string;
  kind: string;
  mood: string;
  day: string;              // the author's day key
  stoneTs: number;          // author's stone.ts — half of the dedupe key
  authorUserId: string;     // other half of the dedupe key
  authorName?: string;
  authorAvatarUrl?: string;
  keptAt: number;           // unix ms when you kept it
}

export interface PebbleSave {
  stones: Stone[];
  kept?: KeptStone[];
}

export function keepKey(authorUserId: string, stoneTs: number): string {
  return `${authorUserId}:${stoneTs}`;
}

export type GenStage =
  | 'idle'
  | 'first'       // 0-15s — feeling for it
  | 'shifting'   // 15-60s — sand is shifting
  | 'surfacing'  // 60s+ — about to surface
  | 'retry';     // backoff after 429

interface UsePebbles {
  loaded: boolean;
  stones: Stone[];
  todayDone: boolean;
  pickToday: () => Promise<Stone | null>;
  freshStone: Stone | null;     // the one just picked up, awaiting "keep"
  acceptFresh: () => void;
  generating: boolean;
  stage: GenStage;
  error: string | null;
  // Beachcomber social layer — stones you've kept from others' tide entries.
  kept: KeptStone[];
  isKept: (authorUserId: string, stoneTs: number) => boolean;
  keepStone: (k: Omit<KeptStone, 'keptAt'>) => boolean;  // returns true if it was a NEW keep (vs no-op)
  unkeepStone: (authorUserId: string, stoneTs: number) => void;
}

export function usePebbles(): UsePebbles {
  const save = useGameSave<PebbleSave>('pebble-pocket');
  const genImg = useGenImage();
  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState<GenStage>('idle');
  const [freshStone, setFreshStone] = useState<Stone | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Local mirror — useGameSave.savedData doesn't update post-persist (known
  // platform-side limitation; see [feedback_savedData_stale_after_persist]).
  // We seed from savedData on initial load and from then on the local mirror
  // is the source of truth for the UI.
  const [stones, setStones] = useState<Stone[]>([]);
  const [kept, setKept] = useState<KeptStone[]>([]);
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    if (save.savedData) {
      setStones(save.savedData.stones || []);
      setKept(save.savedData.kept || []);
      seededRef.current = true;
    } else if (save.loaded) {
      seededRef.current = true;
    }
  }, [save.savedData, save.loaded]);

  const todayDone = stones.length > 0 && stones[stones.length - 1].day === dayKey();

  const pickToday = useCallback(async (): Promise<Stone | null> => {
    if (todayDone) return null;
    setError(null);
    setGenerating(true);
    setStage('first');
    const recipe = newStoneRecipe();
    try {
      // Stage progression by elapsed time
      let elapsed = 0;
      const tick = setInterval(() => {
        elapsed += 5;
        if (elapsed > 60) setStage('surfacing');
        else if (elapsed > 15) setStage('shifting');
      }, 5000);
      const url = await genImageWithRetry(
        genImg,
        { prompt: recipe.prompt },
        (p) => { if (p.retrying) setStage('retry'); },
      );
      clearInterval(tick);
      const stone: Stone = {
        url, day: dayKey(), ts: Date.now(), kind: recipe.kind, mood: recipe.mood,
      };
      setFreshStone(stone);
      setStage('idle');
      setGenerating(false);
      return stone;
    } catch (e) {
      setStage('idle');
      setGenerating(false);
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [todayDone, genImg]);

  const acceptFresh = useCallback(() => {
    if (!freshStone) return;
    setStones((prev) => {
      const next = [...prev, freshStone];
      save.persist({ stones: next, kept });
      return next;
    });
    setFreshStone(null);
  }, [freshStone, save, kept]);

  const isKept = useCallback(
    (authorUserId: string, stoneTs: number) => {
      return kept.some(
        (k) => k.authorUserId === authorUserId && k.stoneTs === stoneTs,
      );
    },
    [kept],
  );

  const keepStone = useCallback(
    (k: Omit<KeptStone, 'keptAt'>): boolean => {
      if (kept.some((x) => x.authorUserId === k.authorUserId && x.stoneTs === k.stoneTs)) {
        return false;
      }
      const entry: KeptStone = { ...k, keptAt: Date.now() };
      setKept((prev) => {
        const next = [...prev, entry];
        save.persist({ stones, kept: next });
        return next;
      });
      return true;
    },
    [kept, stones, save],
  );

  const unkeepStone = useCallback(
    (authorUserId: string, stoneTs: number) => {
      setKept((prev) => {
        const next = prev.filter(
          (x) => !(x.authorUserId === authorUserId && x.stoneTs === stoneTs),
        );
        if (next.length === prev.length) return prev;
        save.persist({ stones, kept: next });
        return next;
      });
    },
    [stones, save],
  );

  return {
    loaded: save.loaded,
    stones,
    todayDone,
    pickToday,
    freshStone,
    acceptFresh,
    generating,
    stage,
    error,
    kept,
    isKept,
    keepStone,
    unkeepStone,
  };
}
