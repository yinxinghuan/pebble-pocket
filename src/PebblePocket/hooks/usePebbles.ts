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

export interface PebbleSave {
  stones: Stone[];
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
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    if (save.savedData?.stones) {
      setStones(save.savedData.stones);
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
      save.persist({ stones: next });
      return next;
    });
    setFreshStone(null);
  }, [freshStone, save]);

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
  };
}
