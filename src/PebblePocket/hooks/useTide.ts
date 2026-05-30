// Today's tide — cross-user stone collection.
// Pulls every recent user's full pebble archive via get/data/list, flattens
// (per throttle-at-input rule — never `archive[0]`), resolves each unique
// author's profile, sorts newest-first.

import { useCallback, useEffect, useState } from 'react';
import {
  callAigramAPI,
  isInAigram,
  telegramId,
  type AigramResponse,
} from '@shared/runtime/bridge';
import { getGameUuid } from '@shared/runtime/game-id';
import type { PebbleSave, Stone } from './usePebbles';

export interface TideEntry {
  userId: string;
  userName?: string;
  userAvatarUrl?: string;
  stone: Stone;
}

interface SaveRow {
  user_id: string;
  time?: string;
  resource_data?: string;
}

const DISPLAY_CAP = 100;

export interface UseTide {
  entries: TideEntry[];
  loaded: boolean;
  refresh: () => void;
}

export function useTide(): UseTide {
  const [entries, setEntries] = useState<TideEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const sessionId = getGameUuid();
    if (!isInAigram || !sessionId) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await callAigramAPI<AigramResponse<SaveRow[]>>(
          `/note/aigram/ai/game/get/data/list?session_id=${encodeURIComponent(sessionId)}`,
          'GET',
        );
        const rows = Array.isArray(res?.data) ? res.data : [];

        // Flatten ALL stones from each user's save row (not just [0]).
        const pairs: Array<{ userId: string; stone: Stone }> = [];
        for (const row of rows) {
          if (!row.user_id || !row.resource_data) continue;
          try {
            const save = JSON.parse(row.resource_data) as PebbleSave;
            for (const s of save.stones || []) {
              if (s && s.url) {
                pairs.push({ userId: String(row.user_id), stone: s });
              }
            }
          } catch {
            /* skip corrupt row */
          }
        }
        pairs.sort((a, b) => (b.stone.ts ?? 0) - (a.stone.ts ?? 0));
        const limited = pairs.slice(0, DISPLAY_CAP);

        // Resolve each unique author's profile once.
        const uniqueIds = Array.from(new Set(limited.map((p) => p.userId)));
        const profileEntries = await Promise.all(
          uniqueIds.map(async (uid) => {
            try {
              const r = await callAigramAPI<
                AigramResponse<{ name?: string; head_url?: string }>
              >(
                `/note/telegram/user/get/info/by/telegram_id?telegram_id=${encodeURIComponent(uid)}`,
                'GET',
              );
              return [uid, r?.data ?? null] as const;
            } catch {
              return [uid, null] as const;
            }
          }),
        );
        const profileMap = new Map<string, { name?: string; head_url?: string } | null>(
          profileEntries,
        );

        if (cancelled) return;
        setEntries(
          limited.map(({ userId, stone }) => {
            const p = profileMap.get(userId) || null;
            return {
              userId,
              userName: p?.name,
              userAvatarUrl: p?.head_url,
              stone,
            };
          }),
        );
      } catch {
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { entries, loaded, refresh };
}

export function isSelfEntry(entry: TideEntry): boolean {
  return !!telegramId && String(entry.userId) === String(telegramId);
}
