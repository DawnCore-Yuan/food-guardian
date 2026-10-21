/**
 * 暱稱正規化（規格：去首尾空白、最多 12 個「使用者可見字元」）。
 *
 * 用 Intl.Segmenter 依字素切分，讓 emoji 與組合字元算 1 個字元而不是 2 個；
 * 舊瀏覽器退回 Array.from（仍比 .length 正確）。
 * 一律以純文字顯示：資料庫端會再驗證並拒絕控制字元，前端渲染只走 textContent。
 */
export const NICKNAME_MAX = 12;
export const NICKNAME_FALLBACK = '匿名隊員';

type Segments = { segment: string }[];

function graphemes(input: string): string[] {
  const Ctor = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => { segment(s: string): Iterable<Segments[number]> } }).Segmenter;
  if (typeof Ctor === 'function') {
    const seg = new Ctor('zh-Hant', { granularity: 'grapheme' });
    return Array.from(seg.segment(input), (s) => s.segment);
  }
  return Array.from(input);
}

/** 去除控制字元與零寬字元，避免偽造排版或不可見字元 */
function stripInvisible(input: string): string {
  return input.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '');
}

export function normalizeNickname(raw: string): string {
  const trimmed = stripInvisible(String(raw ?? '')).trim();
  if (!trimmed) return NICKNAME_FALLBACK;
  return graphemes(trimmed).slice(0, NICKNAME_MAX).join('');
}
