export interface Settings {
  schemaVersion: number;
  soundOn: boolean;
  reduceMotion: boolean;
  highScore: number;
}

const KEY = 'food-guardian.settings.v1';
const DEFAULTS: Settings = { schemaVersion: 1, soundOn: true, reduceMotion: false, highScore: 0 };

function safeDefaults(): Settings {
  return { ...DEFAULTS };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return safeDefaults();
    const parsed = JSON.parse(raw) as Partial<Settings>;
    if (typeof parsed !== 'object' || parsed === null) return safeDefaults();
    if (parsed.schemaVersion !== 1) {
      return { ...safeDefaults(), highScore: Number(parsed.highScore) || 0 };
    }
    return {
      schemaVersion: 1,
      soundOn: typeof parsed.soundOn === 'boolean' ? parsed.soundOn : DEFAULTS.soundOn,
      reduceMotion: typeof parsed.reduceMotion === 'boolean' ? parsed.reduceMotion : DEFAULTS.reduceMotion,
      highScore: Number.isFinite(parsed.highScore) ? Math.max(0, Number(parsed.highScore)) : 0,
    };
  } catch {
    return safeDefaults();
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 儲存失敗不得阻止遊戲
  }
}
