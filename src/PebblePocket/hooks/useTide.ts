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

// Someone who kept one of YOUR stones. Comes from scanning every user's
// `kept[]` array for entries where `authorUserId === self`.
export interface Keeper {
  userId: string;
  userName?: string;
  userAvatarUrl?: string;
  keptAt: number;
}

interface SaveRow {
  user_id: string;
  time?: string;
  resource_data?: string;
}

const DISPLAY_CAP = 100;

export interface UseTide {
  entries: TideEntry[];
  /** Map keyed by your own stone.ts → list of users who kept it. */
  keepersByMyStoneTs: Map<number, Keeper[]>;
  loaded: boolean;
  refresh: () => void;
}

export function useTide(): UseTide {
  const [entries, setEntries] = useState<TideEntry[]>([]);
  const [keepersByMyStoneTs, setKeepersByMyStoneTs] = useState<Map<number, Keeper[]>>(
    new Map(),
  );
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
        // Build keepers map for self's stones, keyed by my stone.ts.
        const keepersMap = new Map<number, Keeper[]>();
        for (const row of rows) {
          if (!row.user_id || !row.resource_data) continue;
          try {
            const save = JSON.parse(row.resource_data) as PebbleSave;
            for (const s of save.stones || []) {
              if (s && s.url) {
                pairs.push({ userId: String(row.user_id), stone: s });
              }
            }
            // kept[] entries from THIS row where the original author is me.
            // Don't count yourself if you somehow ended up in this row.
            if (telegramId && String(row.user_id) !== String(telegramId)) {
              for (const k of save.kept || []) {
                if (
                  k &&
                  k.stoneTs &&
                  String(k.authorUserId) === String(telegramId)
                ) {
                  const list = keepersMap.get(k.stoneTs) || [];
                  list.push({
                    userId: String(row.user_id),
                    keptAt: k.keptAt || 0,
                  });
                  keepersMap.set(k.stoneTs, list);
                }
              }
            }
          } catch {
            /* skip corrupt row */
          }
        }
        pairs.sort((a, b) => (b.stone.ts ?? 0) - (a.stone.ts ?? 0));
        const limited = pairs.slice(0, DISPLAY_CAP);

        // Resolve each unique user's profile once. Includes both tide entry
        // authors AND keepers of self's stones — single fetch per id.
        const idSet = new Set<string>(limited.map((p) => p.userId));
        for (const list of keepersMap.values()) {
          for (const k of list) idSet.add(k.userId);
        }
        const uniqueIds = Array.from(idSet);
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
        // Hydrate keepers with profile + sort newest-first.
        const hydratedKeepers = new Map<number, Keeper[]>();
        for (const [stoneTs, list] of keepersMap.entries()) {
          const hydrated = list.map((k) => {
            const p = profileMap.get(k.userId) || null;
            return {
              ...k,
              userName: p?.name,
              userAvatarUrl: p?.head_url,
            };
          });
          hydrated.sort((a, b) => (b.keptAt || 0) - (a.keptAt || 0));
          hydratedKeepers.set(stoneTs, hydrated);
        }
        setKeepersByMyStoneTs(hydratedKeepers);
      } catch {
        if (!cancelled) {
          setEntries([]);
          setKeepersByMyStoneTs(new Map());
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { entries, keepersByMyStoneTs, loaded, refresh };
}

export function isSelfEntry(entry: TideEntry): boolean {
  return !!telegramId && String(entry.userId) === String(telegramId);
}
