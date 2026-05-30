import { useEffect, useRef, useState } from 'react';
import './PebblePocket.less';
import { usePebbles, Stone } from './hooks/usePebbles';
import { initAudio, playBell, playSwell } from './utils/audio';
import { msUntilTomorrow, formatDay } from './utils/dayKey';
import { t } from './i18n';

type Phase = 'beach' | 'generating' | 'reveal' | 'pocket' | 'detail';

export default function PebblePocket() {
  const pebbles = usePebbles();
  const [phase, setPhase] = useState<Phase>('beach');
  const [openStone, setOpenStone] = useState<Stone | null>(null);
  const [pressing, setPressing] = useState(false);
  const [demoActive, setDemoActive] = useState(true); // intro demo runs until first real touch
  const audioInitedRef = useRef(false);

  // Initial routing once save loads. If today's stone is already in the pocket,
  // land on the pocket view; otherwise start at the beach.
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
    playBell(196, 0.14); // soft G3 plant
    const stone = await pebbles.pickToday();
    if (stone) {
      setPhase('reveal');
      playBell(523, 0.18);  // C5 shimmer
    } else {
      // error: bounce back to beach with error overlay
      setPhase('beach');
    }
  };

  const keepStone = () => {
    pebbles.acceptFresh();
    playBell(659, 0.14); // E5
    setPhase('pocket');
  };

  const openDetail = (s: Stone) => {
    firstTouch();
    setOpenStone(s);
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

  // Sorted newest-first for pocket display
  const newestFirst = [...pebbles.stones].slice().reverse();

  return (
    <div className="pp">
      <Wm />

      {phase === 'beach' && (
        <BeachView
          onBegin={beginGen}
          onPress={setPressing}
          pressing={pressing}
          demoActive={demoActive}
          error={pebbles.error}
          hasStones={pebbles.stones.length > 0}
          onGoPocket={() => { firstTouch(); setPhase('pocket'); }}
        />
      )}

      {phase === 'generating' && (
        <GeneratingView stage={pebbles.stage} />
      )}

      {phase === 'reveal' && pebbles.freshStone && (
        <RevealView stone={pebbles.freshStone} onKeep={keepStone} />
      )}

      {phase === 'pocket' && (
        <PocketView
          stones={newestFirst}
          onOpen={openDetail}
          onGoBeach={() => { firstTouch(); setPhase('beach'); }}
          todayDone={pebbles.todayDone}
        />
      )}

      {phase === 'detail' && openStone && (
        <DetailView stone={openStone} onClose={closeDetail} />
      )}
    </div>
  );
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
  hasStones: boolean;
  onGoPocket: () => void;
}
function BeachView(props: BeachProps) {
  return (
    <div className="pp-beach">
      <div className="pp-beach__title">{t('beach.title')}</div>

      <button
        className={`pp-hole${props.pressing ? ' is-pressing' : ''}${props.demoActive ? ' is-demoing' : ''}`}
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
        <div className="pp-hole__rim" />
        <div className="pp-hole__shadow" />
        <div className="pp-hole__glow" />
        {props.demoActive && (
          <div className="pp-demo-finger" aria-hidden="true">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 11.24V7.5C9 6.12 10.12 5 11.5 5S14 6.12 14 7.5v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.92-1.38z"/>
            </svg>
          </div>
        )}
      </button>

      <div className="pp-beach__hint">
        {props.demoActive ? t('beach.demo') : t('beach.hint')}
      </div>

      {props.error && (
        <div className="pp-beach__error">{t('gen.error')}</div>
      )}

      {props.hasStones && (
        <button className="pp-beach__pocket-btn" onPointerDown={(e) => { e.preventDefault(); props.onGoPocket(); }}>
          {t('pocket.title')} →
        </button>
      )}
    </div>
  );
}

// ─── Generating view ───────────────────────────────────────────────────────
function GeneratingView({ stage }: { stage: string }) {
  const messages: Record<string, string> = {
    first: t('gen.first'),
    shifting: t('gen.shifting'),
    surfacing: t('gen.surfacing'),
    retry: t('gen.retry'),
    idle: t('gen.first'),
  };
  return (
    <div className="pp-gen">
      <div className="pp-gen__ripple">
        <div className="pp-gen__ripple-inner" />
        <div className="pp-gen__ripple-pulse" />
      </div>
      <div className="pp-gen__msg">{messages[stage] || messages.first}</div>
    </div>
  );
}

// ─── Reveal view ───────────────────────────────────────────────────────────
function RevealView({ stone, onKeep }: { stone: Stone; onKeep: () => void }) {
  return (
    <div className="pp-reveal" onPointerDown={(e) => { e.preventDefault(); onKeep(); }}>
      <div className="pp-reveal__found">{t('beach.found')}</div>
      <div className="pp-reveal__stone">
        <img src={stone.url} alt={stone.kind} />
      </div>
      <div className="pp-reveal__kind">{stone.kind}</div>
      <div className="pp-reveal__sub">{t('beach.found.sub')}</div>
    </div>
  );
}

// ─── Pocket view ───────────────────────────────────────────────────────────
function PocketView({
  stones, onOpen, onGoBeach, todayDone,
}: {
  stones: Stone[]; onOpen: (s: Stone) => void; onGoBeach: () => void; todayDone: boolean;
}) {
  const count = stones.length;
  const countKey = count === 1 ? 'pocket.count_one' : 'pocket.count_other';
  return (
    <div className="pp-pocket">
      <div className="pp-pocket__header">
        <div className="pp-pocket__title">{t('pocket.title')}</div>
        <div className="pp-pocket__count">{t(countKey, { n: count })}</div>
      </div>
      {count === 0 ? (
        <div className="pp-pocket__empty">
          <div>{t('pocket.empty.line1')}</div>
          <div className="pp-pocket__empty-sub">{t('pocket.empty.line2')}</div>
          <button className="pp-pocket__back" onPointerDown={(e) => { e.preventDefault(); onGoBeach(); }}>
            {t('pocket.beach')}
          </button>
        </div>
      ) : (
        <>
          <div className="pp-pocket__grid">
            {stones.map((s, i) => (
              <button
                key={s.ts}
                className={`pp-stone-card${i === 0 && todayDone ? ' is-today' : ''}`}
                onPointerDown={(e) => { e.preventDefault(); onOpen(s); }}
              >
                <div className="pp-stone-card__photo">
                  <img src={s.url} alt={s.kind} loading="lazy" />
                </div>
                <div className="pp-stone-card__meta">
                  {i === 0 && todayDone ? t('pocket.today.label') : formatDay(s.day)}
                </div>
              </button>
            ))}
          </div>
          <div className="pp-pocket__footer">
            {todayDone ? (
              <CountdownLine />
            ) : (
              <button className="pp-pocket__back" onPointerDown={(e) => { e.preventDefault(); onGoBeach(); }}>
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
      setText(`${t('pocket.tomorrow')} · ${h}h ${m}m`);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  return <div className="pp-pocket__countdown">{text}</div>;
}

// ─── Detail view ───────────────────────────────────────────────────────────
function DetailView({ stone, onClose }: { stone: Stone; onClose: () => void }) {
  return (
    <div className="pp-detail" onPointerDown={(e) => { e.preventDefault(); onClose(); }}>
      <div className="pp-detail__photo">
        <img src={stone.url} alt={stone.kind} />
      </div>
      <div className="pp-detail__meta">
        <div className="pp-detail__kind">{stone.kind}</div>
        <div className="pp-detail__day">{formatDay(stone.day)}</div>
      </div>
      <div className="pp-detail__hint">{t('detail.close')}</div>
    </div>
  );
}
