type Locale = 'en' | 'zh';

const STR: Record<Locale, Record<string, string>> = {
  en: {
    'beach.title': 'today\'s stone',
    'beach.sub': 'the tide brings one',
    'beach.hint': 'press the sand',
    'beach.demo': 'press to surface',
    'gen.caption': 'surfacing',
    'gen.first': 'feeling for it…',
    'gen.shifting': 'the sand is shifting…',
    'gen.surfacing': 'something is surfacing…',
    'gen.retry': 'the tide turned back · trying again',
    'gen.error': 'the sand was empty today · try again',
    'gen.wait': 'this takes a moment',
    'reveal.head': 'one was here',
    'reveal.cta': 'tap to keep',
    'pocket.title': 'the pocket',
    'pocket.count_one': '{n} specimen',
    'pocket.count_other': '{n} specimens',
    'pocket.day': 'day {n}',
    'pocket.tomorrow': 'one more tomorrow',
    'pocket.today.label': 'today',
    'pocket.empty.line1': 'no specimens yet',
    'pocket.empty.line2': 'press the sand to surface\nyour first',
    'pocket.beach': 'to the beach',
    'detail.close': 'tap anywhere to close',
    'status.stone': 'specimen',
    'status.stones': 'specimens',
  },
  zh: {
    'beach.title': '今日的石头',
    'beach.sub': '潮水带来一颗',
    'beach.hint': '按一下沙子',
    'beach.demo': '按住浮起',
    'gen.caption': '浮起',
    'gen.first': '正在摸索…',
    'gen.shifting': '沙子在动…',
    'gen.surfacing': '有什么浮上来了…',
    'gen.retry': '潮水退了 · 再来一次',
    'gen.error': '今天沙子是空的 · 再试一次',
    'gen.wait': '需要一会儿',
    'reveal.head': '有一颗',
    'reveal.cta': '点一下收进口袋',
    'pocket.title': '口袋',
    'pocket.count_one': '{n} 颗',
    'pocket.count_other': '{n} 颗',
    'pocket.day': '第 {n} 天',
    'pocket.tomorrow': '明天再一颗',
    'pocket.today.label': '今天',
    'pocket.empty.line1': '口袋里还没有',
    'pocket.empty.line2': '去沙滩按一下\n摸出第一颗',
    'pocket.beach': '回到沙滩',
    'detail.close': '点任意处关闭',
    'status.stone': '颗',
    'status.stones': '颗',
  },
};

function detectLocale(): Locale {
  try {
    const o = localStorage.getItem('pebble_locale');
    if (o === 'en' || o === 'zh') return o;
  } catch (_) {}
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

let LOCALE: Locale = detectLocale();

export function t(key: string, vars?: { n?: number | string }): string {
  let s = STR[LOCALE][key];
  if (!s) return key;
  if (vars && vars.n != null) s = s.replace('{n}', String(vars.n));
  return s;
}
export function locale(): Locale { return LOCALE; }
