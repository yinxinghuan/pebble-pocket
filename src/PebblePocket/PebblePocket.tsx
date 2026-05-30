import { useEffect, useRef, useState } from 'react';
import './PebblePocket.less';
import { usePebbles, Stone } from './hooks/usePebbles';
import { initAudio, playBell, playSwell, installGlobalTapFeedback } from './utils/audio';
import { dayKey, msUntilTomorrow, formatDay } from './utils/dayKey';
import { t } from './i18n';

type Phase = 'beach' | 'generating' | 'reveal' | 'pocket' | 'detail';

// Specimen number = 1-indexed position in stones array. Permanent per stone.
function specimenId(idx: number): string {
  return `№${String(idx + 1).padStart(3, '0')}`;
}

// Per-card bob phase — hash from ts so each card has its own subtle rhythm
function bobDelay(ts: number): string {
  return `${(ts % 6000) / 1000}s`;
}

export default function PebblePocket() {
  const pebbles = usePebbles();
  const [phase, setPhase] = useState<Phase>('beach');
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [pressing, setPressing] = useState(false);
  const [demoActive, setDemoActive] = useState(true);
  const audioInitedRef = useRef(false);
  // Install the delegated tap feedback listener once.
  useEffect(() => { installGlobalTapFeedback(); }, []);

  useEffect(() => {
    if (!pebbles.loaded) return;
    if (pebbles.todayDone) setPhase('pocket');
    else setPhase('beach');
  }, [pebbles.loaded, pebbles.todayDone]);

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
  };

  const openDetail = (idx: number) => {
    firstTouch();
    setOpenIdx(idx);
    setPhase('detail');
    playSwell();
  };
  const closeDetail = () => {
    setOpenIdx(null);
    setPhase('pocket');
  };

  if (!pebbles.loaded) {
    return <div className="pp pp--loading"><div className="pp-spin" /></div>;
  }

  // Newest-first for display, but specimen ID stays its archive position
  // (oldest = №001, newest = №N) so the number is permanent.
  const stones = pebbles.stones;
  const newestFirst = stones.map((s, i) => ({ stone: s, idx: i })).reverse();
  const total = stones.length;

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
          stones={newestFirst}
          onOpen={openDetail}
          onGoBeach={() => { firstTouch(); setPhase('beach'); }}
          todayDone={pebbles.todayDone}
        />
      )}

      {phase === 'detail' && openIdx != null && stones[openIdx] && (
        <DetailView stone={stones[openIdx]} idx={openIdx} onClose={closeDetail} />
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
  // YYYY-MM-DD → e.g. 05·30
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

      {props.stones.length > 0 && (
        <button className="pp-beach__pocket-btn" onPointerDown={(e) => { e.preventDefault(); props.onGoPocket(); }}>
          {t('pocket.title')}
          <span className="pp-beach__pocket-btn-arrow">→</span>
        </button>
      )}
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
function PocketView({
  stones, onOpen, onGoBeach, todayDone,
}: {
  stones: { stone: Stone; idx: number }[];
  onOpen: (idx: number) => void;
  onGoBeach: () => void;
  todayDone: boolean;
}) {
  const total = stones.length;
  const days = todayDone ? total : total + 1; // user's count of days they could pick (rough estimate)
  return (
    <div className="pp-pocket">
      <div className="pp-pocket__header">
        <div className="pp-pocket__head-rule" />
        <div className="pp-pocket__title">{t('pocket.title')}</div>
        <div className="pp-pocket__meta">
          <span>{total === 1 ? t('pocket.count_one', { n: total }) : t('pocket.count_other', { n: total })}</span>
          <span className="pp-pocket__meta-dot">·</span>
          <span>{t('pocket.day', { n: days })}</span>
        </div>
      </div>

      {total === 0 ? (
        <div className="pp-pocket__empty">
          <div className="pp-pocket__empty-rule" />
          <div className="pp-pocket__empty-title">{t('pocket.empty.line1')}</div>
          <div className="pp-pocket__empty-sub">{t('pocket.empty.line2')}</div>
          <button className="pp-pocket__back-btn" onPointerDown={(e) => { e.preventDefault(); onGoBeach(); }}>
            {t('pocket.beach')}
          </button>
        </div>
      ) : (
        <>
          <div className="pp-pocket__grid">
            {stones.map(({ stone, idx }, gridI) => (
              <button
                key={stone.ts}
                className={`pp-spec${gridI === 0 && todayDone ? ' is-today' : ''}`}
                style={{ ['--bob-delay' as never]: bobDelay(stone.ts) }}
                onPointerDown={(e) => { e.preventDefault(); onOpen(idx); }}
              >
                <div className="pp-spec__id">{specimenId(idx)}{gridI === 0 && todayDone ? ` · ${t('pocket.today.label')}` : ''}</div>
                <div className="pp-spec__photo">
                  <img src={stone.url} alt={stone.kind} loading="lazy" />
                </div>
                <div className="pp-spec__kind">{stone.kind}</div>
                <div className="pp-spec__day">{formatDay(stone.day)}</div>
              </button>
            ))}
          </div>
          <div className="pp-pocket__footer">
            {todayDone ? (
              <CountdownLine />
            ) : (
              <button className="pp-pocket__back-btn" onPointerDown={(e) => { e.preventDefault(); onGoBeach(); }}>
                {t('pocket.beach')}
              </button>
            )}
          </div>
        </>
      )}
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
function DetailView({ stone, idx, onClose }: { stone: Stone; idx: number; onClose: () => void }) {
  return (
    <div className="pp-detail" onPointerDown={(e) => { e.preventDefault(); onClose(); }}>
      <div className="pp-detail__head">{specimenId(idx)}</div>
      <div className="pp-detail__photo">
        <img src={stone.url} alt={stone.kind} />
      </div>
      <div className="pp-detail__meta">
        <div className="pp-detail__kind">{stone.kind}</div>
        <div className="pp-detail__mood">{stone.mood}</div>
        <div className="pp-detail__day">{formatDay(stone.day)}</div>
      </div>
      <div className="pp-detail__hint">{t('detail.close')}</div>
    </div>
  );
}
