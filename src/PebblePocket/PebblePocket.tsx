import { useEffect, useMemo, useRef, useState } from 'react';
import { isInAigram, openAigramProfile } from '@shared/runtime';
import './PebblePocket.less';
import { usePebbles, Stone } from './hooks/usePebbles';
import { useTide, TideEntry, isSelfEntry } from './hooks/useTide';
import { initAudio, playBell, playSwell, installGlobalTapFeedback } from './utils/audio';
import { dayKey, msUntilTomorrow, formatDay } from './utils/dayKey';
import { t } from './i18n';

type Phase = 'beach' | 'generating' | 'reveal' | 'pocket' | 'detail';
type Tab = 'tide' | 'mine';

// Specimen number = 1-indexed position in stones array. Permanent per stone.
function specimenId(idx: number): string {
  return `№${String(idx + 1).padStart(3, '0')}`;
}

// Per-card bob phase — hash from ts so each card has its own subtle rhythm
function bobDelay(ts: number): string {
  return `${(ts % 6000) / 1000}s`;
}

// Build a list of the last N day-keys ending today, newest first.
function recentDays(n: number): string[] {
  const today = new Date();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

// Short "MM·DD" label for a YYYY-MM-DD day key
function shortDay(k: string): string {
  const [, m, d] = k.split('-');
  return `${m}·${d}`;
}

export default function PebblePocket() {
  const pebbles = usePebbles();
  const tide = useTide();
  const [phase, setPhase] = useState<Phase>('beach');
  const [openStone, setOpenStone] = useState<{ stone: Stone; entry?: TideEntry; idx?: number } | null>(null);
  const [pressing, setPressing] = useState(false);
  const [demoActive, setDemoActive] = useState(true);
  const audioInitedRef = useRef(false);
  // Tab + day picker live at the pocket level (not inside PocketView) so
  // they survive navigating to detail and back without resetting.
  const [tab, setTab] = useState<Tab>('tide'); // community-first per social-wall skill
  const [selectedDay, setSelectedDay] = useState<string>(() => dayKey());

  // Install the delegated tap feedback listener once.
  useEffect(() => { installGlobalTapFeedback(); }, []);

  useEffect(() => {
    if (!pebbles.loaded) return;
    if (pebbles.todayDone) setPhase('pocket');
    else setPhase('beach');
  }, [pebbles.loaded, pebbles.todayDone]);

  // When entering pocket, refresh the tide so new community entries land
  // without a page reload.
  useEffect(() => {
    if (phase === 'pocket') tide.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const firstTouch = () => {
    if (!audioInitedRef.current) {
      audioInitedRef.current = true;
      initAudio();
    }
    setDemoActive(false);
  };

  const beginGen = async () => {
    firstTouch();
    if (pebbles.todayDone || pebbles.generating) return;
    setPhase('generating');
    playBell(196, 0.14);
    const stone = await pebbles.pickToday();
    if (stone) {
      setPhase('reveal');
      playBell(523, 0.18);
    } else {
      setPhase('beach');
    }
  };

  const keepStone = () => {
    pebbles.acceptFresh();
    playBell(659, 0.14);
    setPhase('pocket');
    setTab('mine');
    // Refresh tide so the user's just-published stone joins others.
    tide.refresh();
  };

  const openOwnStone = (idx: number) => {
    firstTouch();
    const stone = pebbles.stones[idx];
    if (!stone) return;
    setOpenStone({ stone, idx });
    setPhase('detail');
    playSwell();
  };
  const openTideStone = (entry: TideEntry) => {
    firstTouch();
    setOpenStone({ stone: entry.stone, entry });
    setPhase('detail');
    playSwell();
  };
  const closeDetail = () => {
    setOpenStone(null);
    setPhase('pocket');
  };

  if (!pebbles.loaded) {
    return <div className="pp pp--loading"><div className="pp-spin" /></div>;
  }

  const stones = pebbles.stones;
  const total = stones.length;

  // Optimistic merge for the TIDE tab — the player's own latest stone
  // lives in pebbles.stones for ~1s before the cloud get/data/list catches
  // up. Dedupe by stone.ts since the same stone appears as 'self' before
  // sync and the real telegram_id after. See social-wall skill.
  const mineAsTide: TideEntry[] = stones.map((s) => ({
    userId: 'self',
    userName: undefined,
    userAvatarUrl: undefined,
    stone: s,
  }));
  const tideMerged: TideEntry[] = (() => {
    const seenTs = new Set(mineAsTide.map((e) => e.stone.ts));
    return [
      ...mineAsTide,
      ...tide.entries.filter((e) => !seenTs.has(e.stone.ts)),
    ].sort((a, b) => (b.stone.ts ?? 0) - (a.stone.ts ?? 0));
  })();

  // Days strip — last 14 days. Each carries a count for both tabs so the
  // dots make the activity legible without opening each day.
  const days = recentDays(14);
  const mineDayCount = new Map<string, number>();
  for (const s of stones) mineDayCount.set(s.day, (mineDayCount.get(s.day) ?? 0) + 1);
  const tideDayCount = new Map<string, number>();
  for (const e of tideMerged) tideDayCount.set(e.stone.day, (tideDayCount.get(e.stone.day) ?? 0) + 1);

  return (
    <div className="pp">
      <StatusStrip total={total} todayDone={pebbles.todayDone} phase={phase} />
      <Wm />

      {phase === 'beach' && (
        <BeachView
          onBegin={beginGen}
          onPress={setPressing}
          pressing={pressing}
          demoActive={demoActive}
          error={pebbles.error}
          stones={stones}
          onGoPocket={() => { firstTouch(); setPhase('pocket'); }}
        />
      )}

      {phase === 'generating' && (
        <GeneratingView stage={pebbles.stage} />
      )}

      {phase === 'reveal' && pebbles.freshStone && (
        <RevealView stone={pebbles.freshStone} idx={stones.length} onKeep={keepStone} />
      )}

      {phase === 'pocket' && (
        <PocketView
          tab={tab}
          onTab={setTab}
          days={days}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          mineDayCount={mineDayCount}
          tideDayCount={tideDayCount}
          stones={stones}
          tideEntries={tideMerged}
          tideLoaded={tide.loaded}
          onOpenOwn={openOwnStone}
          onOpenTide={openTideStone}
          onGoBeach={() => { firstTouch(); setPhase('beach'); }}
          todayDone={pebbles.todayDone}
        />
      )}

      {phase === 'detail' && openStone && (
        <DetailView
          stone={openStone.stone}
          idx={openStone.idx}
          author={openStone.entry}
          onClose={closeDetail}
        />
      )}
    </div>
  );
}

// ─── Status strip (top-left, always visible) ───────────────────────────────
function StatusStrip({ total, todayDone, phase }: { total: number; todayDone: boolean; phase: Phase }) {
  if (phase === 'detail') return null;
  return (
    <div className="pp-status">
      <span className="pp-caption pp-caption--faint">{dayCodeShort()}</span>
      {total > 0 && (
        <>
          <span className="pp-status__dot" style={{ background: todayDone ? undefined : 'rgba(241,234,216,0.30)' }} />
          <span className={`pp-caption ${todayDone ? '' : 'pp-caption--faint'}`}>
            {total === 1 ? `1 ${t('status.stone')}` : `${total} ${t('status.stones')}`}
          </span>
        </>
      )}
    </div>
  );
}

function dayCodeShort(): string {
  const k = dayKey();
  const [, m, d] = k.split('-');
  return `${m}·${d}`;
}

function Wm() {
  return <img src={`${import.meta.env.BASE_URL}alteru.svg`} className="pp-wm" alt="AlterU" draggable={false} />;
}

// ─── Beach view ────────────────────────────────────────────────────────────
interface BeachProps {
  onBegin: () => void;
  onPress: (b: boolean) => void;
  pressing: boolean;
  demoActive: boolean;
  error: string | null;
  stones: Stone[];
  onGoPocket: () => void;
}
function BeachView(props: BeachProps) {
  return (
    <div className="pp-beach">
      <div className="pp-beach__title-line">
        <div className="pp-beach__sub">{t('beach.sub')}</div>
        <div className="pp-beach__title">{t('beach.title')}</div>
        <div className="pp-beach__rule" />
      </div>

      <div className="pp-beach__mound-area">
        <button
          className={`pp-mound${props.pressing ? ' is-pressing' : ''}${props.demoActive ? ' is-demoing' : ''}`}
          onPointerDown={(e) => { e.preventDefault(); props.onPress(true); }}
          onPointerUp={(e) => {
            e.preventDefault();
            if (props.pressing) {
              props.onPress(false);
              props.onBegin();
            }
          }}
          onPointerCancel={() => props.onPress(false)}
          onPointerLeave={() => props.onPress(false)}
        >
          <div className="pp-mound__rim" />
          <div className="pp-mound__hole" />
          <div className="pp-mound__glow" />
          {props.demoActive && (
            <div className="pp-demo-finger" aria-hidden="true">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 11.24V7.5C9 6.12 10.12 5 11.5 5S14 6.12 14 7.5v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.92-1.38z"/>
              </svg>
            </div>
          )}
        </button>
      </div>

      {/* Foreshore — silhouettes of recent stones */}
      {props.stones.length > 0 && (
        <div className="pp-beach__foreshore">
          {props.stones.slice(-7).map((s, i) => (
            <div key={s.ts} className="pp-beach__foreshore-pebble" style={{
              width: 14 + (i % 3) * 4,
              height: 8 + (i % 2) * 2,
              opacity: 0.45 + (i / 18),
            }} />
          ))}
        </div>
      )}

      <div className="pp-beach__hint-line">
        <div className={`pp-beach__hint${props.demoActive ? '' : ' pp-beach__hint--idle'}`}>
          {props.demoActive ? t('beach.demo') : t('beach.hint')}
        </div>
      </div>

      {props.error && (
        <div className="pp-beach__error">{t('gen.error')}</div>
      )}

      <button className="pp-beach__pocket-btn" onPointerDown={(e) => { e.preventDefault(); props.onGoPocket(); }}>
        {t('pocket.tab_tide')}
        <span className="pp-beach__pocket-btn-arrow">→</span>
      </button>
    </div>
  );
}

// ─── Generating view ───────────────────────────────────────────────────────
function GeneratingView({ stage }: { stage: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = String(Math.floor(elapsed / 60)).padStart(1, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const messages: Record<string, string> = {
    first: t('gen.first'),
    shifting: t('gen.shifting'),
    surfacing: t('gen.surfacing'),
    retry: t('gen.retry'),
    idle: t('gen.first'),
  };
  return (
    <div className="pp-gen">
      <div className="pp-gen__caption">
        {t('gen.caption')}
        <span className="pp-gen__caption-dot">·</span>
        {mm}:{ss}
      </div>
      <div className="pp-gen__ripple">
        <div className="pp-gen__ripple-inner" />
        <div className="pp-gen__ripple-pulse" />
        <div className="pp-gen__ripple-pulse-2" />
      </div>
      <div className="pp-gen__msg">{messages[stage] || messages.first}</div>
      <div className="pp-gen__elapsed">{t('gen.wait')}</div>
    </div>
  );
}

// ─── Reveal view ───────────────────────────────────────────────────────────
function RevealView({ stone, idx, onKeep }: { stone: Stone; idx: number; onKeep: () => void }) {
  return (
    <div className="pp-reveal" onPointerDown={(e) => { e.preventDefault(); onKeep(); }}>
      <div className="pp-reveal__head">{t('reveal.head')}</div>
      <div className="pp-reveal__card">
        <div className="pp-reveal__card-id">{specimenId(idx)} · {formatDay(stone.day)}</div>
        <div className="pp-reveal__photo">
          <img src={stone.url} alt={stone.kind} />
        </div>
        <div className="pp-reveal__kind">{stone.kind}</div>
        <div className="pp-reveal__mood">{stone.mood}</div>
      </div>
      <div className="pp-reveal__cta">{t('reveal.cta')}</div>
    </div>
  );
}

// ─── Pocket view ───────────────────────────────────────────────────────────
interface PocketProps {
  tab: Tab;
  onTab: (t: Tab) => void;
  days: string[];
  selectedDay: string;
  onSelectDay: (d: string) => void;
  mineDayCount: Map<string, number>;
  tideDayCount: Map<string, number>;
  stones: Stone[];
  tideEntries: TideEntry[];
  tideLoaded: boolean;
  onOpenOwn: (idx: number) => void;
  onOpenTide: (entry: TideEntry) => void;
  onGoBeach: () => void;
  todayDone: boolean;
}
function PocketView(props: PocketProps) {
  const isToday = props.selectedDay === dayKey();

  // Filter the active list by selected day.
  const ownIndexByTs = useMemo(() => {
    const m = new Map<number, number>();
    props.stones.forEach((s, i) => m.set(s.ts, i));
    return m;
  }, [props.stones]);

  const mineToday = props.stones
    .map((s, i) => ({ stone: s, idx: i }))
    .filter(({ stone }) => stone.day === props.selectedDay)
    .reverse(); // newest first within day

  const tideToday = props.tideEntries.filter((e) => e.stone.day === props.selectedDay);

  return (
    <div className="pp-pocket">
      <div className="pp-pocket__header">
        <div className="pp-pocket__head-rule" />
        <div className="pp-pocket__title">{t('pocket.title')}</div>
      </div>

      {/* Tab strip */}
      <div className="pp-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={props.tab === 'tide'}
          className={`pp-tab${props.tab === 'tide' ? ' is-active' : ''}`}
          onClick={() => props.onTab('tide')}
        >
          {t('pocket.tab_tide')}
        </button>
        <button
          role="tab"
          aria-selected={props.tab === 'mine'}
          className={`pp-tab${props.tab === 'mine' ? ' is-active' : ''}`}
          onClick={() => props.onTab('mine')}
        >
          {t('pocket.tab_mine')}
          {props.stones.length > 0 && (
            <span className="pp-tab__badge">{props.stones.length}</span>
          )}
        </button>
      </div>

      {/* Day strip — last 14 days, newest (today) on left. Horizontally
          scrollable so you can swipe back through the week. */}
      <div className="pp-daystrip">
        {props.days.map((d) => {
          const sel = d === props.selectedDay;
          const isT = d === dayKey();
          const mineN = props.mineDayCount.get(d) ?? 0;
          const tideN = props.tideDayCount.get(d) ?? 0;
          const activeCount = props.tab === 'mine' ? mineN : tideN;
          const hasAny = props.tab === 'mine' ? mineN > 0 : tideN > 0;
          return (
            <button
              key={d}
              type="button"
              className={`pp-day${sel ? ' is-selected' : ''}${isT ? ' is-today' : ''}${hasAny ? '' : ' is-empty'}`}
              onClick={() => props.onSelectDay(d)}
              aria-label={d}
            >
              <div className="pp-day__label">
                {isT ? t('pocket.cal_today') : shortDay(d)}
              </div>
              <div className="pp-day__dot-wrap">
                {hasAny ? (
                  <span className="pp-day__count">{activeCount}</span>
                ) : (
                  <span className="pp-day__dot pp-day__dot--faint" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <div className="pp-pocket__grid">
        {props.tab === 'mine' &&
          mineToday.map(({ stone, idx }, gridI) => (
            <button
              key={stone.ts}
              className={`pp-spec${gridI === 0 && isToday && props.todayDone ? ' is-today' : ''}`}
              style={{ ['--bob-delay' as never]: bobDelay(stone.ts) }}
              // onClick — pocket scrolls; pointerdown fires before tap/scroll
              // disambiguation. See scroll-vs-click skill.
              onClick={() => props.onOpenOwn(idx)}
            >
              <div className="pp-spec__id">{specimenId(idx)}{gridI === 0 && isToday && props.todayDone ? ` · ${t('pocket.today.label')}` : ''}</div>
              <div className="pp-spec__photo">
                <img src={stone.url} alt={stone.kind} loading="lazy" />
              </div>
              <div className="pp-spec__kind">{stone.kind}</div>
              <div className="pp-spec__day">{formatDay(stone.day)}</div>
            </button>
          ))}
        {props.tab === 'tide' &&
          tideToday.map((entry, gridI) => {
            const self = isSelfEntry(entry) || entry.userId === 'self';
            const ownIdx = ownIndexByTs.get(entry.stone.ts);
            return (
              <button
                key={`${entry.userId}-${entry.stone.ts}`}
                className={`pp-spec${gridI === 0 && isToday ? ' is-today' : ''}${self ? ' is-self' : ''}`}
                style={{ ['--bob-delay' as never]: bobDelay(entry.stone.ts) }}
                onClick={() => {
                  if (self && ownIdx != null) props.onOpenOwn(ownIdx);
                  else props.onOpenTide(entry);
                }}
              >
                <div className="pp-spec__id">
                  {self ? (
                    <span className="pp-spec__name--self">{t('pocket.you')}</span>
                  ) : (
                    <button
                      type="button"
                      className="pp-spec__author-chip"
                      // Tap author chip → opens that user's Aigram profile.
                      // stopPropagation so the parent card's onClick
                      // (open stone detail) doesn't also fire. See
                      // cross-user-profile-tap skill.
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (isInAigram) openAigramProfile(entry.userId);
                      }}
                      disabled={!isInAigram}
                      aria-label={`Open ${entry.userName || 'user'}'s profile`}
                    >
                      <span className="pp-spec__avatar" aria-hidden>
                        {entry.userAvatarUrl ? (
                          <img src={entry.userAvatarUrl} alt="" draggable={false} />
                        ) : (
                          <span className="pp-spec__avatar-letter">
                            {(entry.userName || '?')[0]?.toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="pp-spec__name">{entry.userName || '·'}</span>
                    </button>
                  )}
                </div>
                <div className="pp-spec__photo">
                  <img src={entry.stone.url} alt={entry.stone.kind} loading="lazy" />
                </div>
                <div className="pp-spec__kind">{entry.stone.kind}</div>
                <div className="pp-spec__day">{formatDay(entry.stone.day)}</div>
              </button>
            );
          })}
      </div>

      {/* Empty states + footer */}
      {props.tab === 'mine' && mineToday.length === 0 && (
        <div className="pp-pocket__empty">
          <div className="pp-pocket__empty-rule" />
          <div className="pp-pocket__empty-title">
            {isToday ? t('pocket.empty.line1') : t('pocket.mine_empty_day')}
          </div>
          {isToday && (
            <div className="pp-pocket__empty-sub">{t('pocket.empty.line2')}</div>
          )}
          {isToday && !props.todayDone && (
            <button className="pp-pocket__back-btn" onClick={props.onGoBeach}>
              {t('pocket.beach')}
            </button>
          )}
        </div>
      )}
      {props.tab === 'tide' && tideToday.length === 0 && props.tideLoaded && (
        <div className="pp-pocket__empty">
          <div className="pp-pocket__empty-rule" />
          <div className="pp-pocket__empty-title">{t('pocket.tide_empty')}</div>
          {isToday && !props.todayDone && (
            <button className="pp-pocket__back-btn" onClick={props.onGoBeach}>
              {t('pocket.beach')}
            </button>
          )}
        </div>
      )}

      <div className="pp-pocket__footer">
        {isToday && props.todayDone ? (
          <CountdownLine />
        ) : isToday && !props.todayDone ? (
          <button className="pp-pocket__back-btn" onClick={props.onGoBeach}>
            {t('pocket.beach')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CountdownLine() {
  const [text, setText] = useState('');
  useEffect(() => {
    const tick = () => {
      const ms = msUntilTomorrow();
      const h = Math.floor(ms / 3600_000);
      const m = Math.floor((ms % 3600_000) / 60_000);
      setText(`${t('pocket.tomorrow')}  ·  ${h}h ${m}m`);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  return <div className="pp-pocket__countdown">{text}</div>;
}

// ─── Detail view ───────────────────────────────────────────────────────────
function DetailView({
  stone,
  idx,
  author,
  onClose,
}: {
  stone: Stone;
  idx?: number;
  author?: TideEntry;
  onClose: () => void;
}) {
  return (
    <div className="pp-detail" onPointerDown={(e) => { e.preventDefault(); onClose(); }}>
      <div className="pp-detail__head">{idx != null ? specimenId(idx) : ''}</div>
      <div className="pp-detail__photo">
        <img src={stone.url} alt={stone.kind} />
      </div>
      <div className="pp-detail__meta">
        <div className="pp-detail__kind">{stone.kind}</div>
        <div className="pp-detail__mood">{stone.mood}</div>
        <div className="pp-detail__day">{formatDay(stone.day)}</div>
        {author && !isSelfEntry(author) && author.userName && (
          <div className="pp-detail__author">
            {t('detail.by')} · {author.userName}
          </div>
        )}
      </div>
      <div className="pp-detail__hint">{t('detail.close')}</div>
    </div>
  );
}
