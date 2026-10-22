/**
 * 極簡 CDP 客戶端（只用 Node 內建 WebSocket，不經 playwright 的 connectOverCDP）。
 * 用於 foodsky-test 遠端瀏覽器在本環境 connectOverCDP 逾時時的替代通道。
 */
export async function connect(wsUrl, { target } = {}) {
  let url = wsUrl;
  if (!url) {
    const list = await (await fetch('http://foodsky-test:9222/json/list')).json();
    const page = target
      ? list.find((t) => t.type === 'page' && target.test(t.url)) ?? list.find((t) => t.type === 'page')
      : list.find((t) => t.type === 'page');
    if (!page) throw new Error('no page target');
    url = page.webSocketDebuggerUrl;
  }
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error('ws error ' + e.message)); });
  // CDP Target.attachToTarget 需 noopener；已知事件 id 一律回 None，避免 headless 端等待未處理的回應
  ws.send(JSON.stringify({ id: 0, method: 'Target.setAutoAttach', params: { autoAttach: false } }));
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message)); else res(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error('timeout ' + method)); } }, 20000);
  });
  const on = (fn) => listeners.push(fn);
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails.text ?? r.exceptionDetails));
    return r.result.value;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  return { send, on, evaluate, sleep, close: () => ws.close() };
}
