type Locale = 'en' | 'zh';

const STR: Record<Locale, Record<string, string>> = {
  en: {
    'beach.title': 'today\'s stone',
    'beach.hint': 'press the sand',
    'beach.demo': 'press & hold',
    'gen.first': 'feeling for it…',
    'gen.shifting': 'the sand is shifting…',
    'gen.surfacing': 'something is surfacing…',
    'gen.retry': 'the tide turned back — trying again',
    'gen.error': 'the sand was empty today. try again.',
    'gen.again': 'try again',
    'beach.found': 'you found one',
    'beach.found.sub': 'tap to keep',
    'pocket.title': 'your pocket',
    'pocket.count_one': '{n} stone',
    'pocket.count_other': '{n} stones',
    'pocket.tomorrow': 'one more tomorrow',
    'pocket.today.label': 'today',
    'pocket.empty.line1': 'no stones yet',
    'pocket.empty.line2': 'press the sand on the beach',
    'pocket.beach': 'beach',
    'detail.close': 'close',
  },
  zh: {
    'beach.title': '今日的石头',
    'beach.hint': '按一按沙子',
    'beach.demo': '按住试试',
    'gen.first': '正在摸索…',
    'gen.shifting': '沙子在动…',
    'gen.surfacing': '有什么浮上来…',
    'gen.retry': '潮水退了，再来一次',
    'gen.error': '今天沙子是空的，再试一次',
    'gen.again': '再来一次',
    'beach.found': '你找到了一颗',
    'beach.found.sub': '点一下收进口袋',
    'pocket.title': '你的口袋',
    'pocket.count_one': '{n} 颗',
    'pocket.count_other': '{n} 颗',
    'pocket.tomorrow': '明天再一颗',
    'pocket.today.label': '今天',
    'pocket.empty.line1': '口袋里还没东西',
    'pocket.empty.line2': '去沙滩按一下',
    'pocket.beach': '回沙滩',
    'detail.close': '关闭',
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
