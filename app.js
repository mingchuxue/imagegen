'use strict';
const $ = s => document.querySelector(s);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};
const API = 'https://api.x.ai/v1/images/generations';
let count = 1;

// Tabs
const titles = { gen: 'AI 画图', history: '历史记录', settings: '设置' };
function tab(name) {
  document.querySelectorAll('section').forEach(s => s.classList.toggle('on', s.id === name));
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  $('#title').textContent = titles[name];
  if (name === 'history') renderHistory();
  window.scrollTo(0, 0);
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => tab(b.dataset.tab));

// Count
document.querySelectorAll('#count button').forEach(b => b.onclick = () => {
  count = +b.dataset.n;
  document.querySelectorAll('#count button').forEach(x => x.classList.toggle('on', x === b));
});

// Settings
$('#key').value = LS.get('xai_key', '');
$('#model').value = LS.get('xai_model', 'grok-imagine-image-2.0');
$('#showKey').onclick = () => { const k = $('#key'); const hidden = k.style.webkitTextSecurity === 'disc'; k.style.webkitTextSecurity = hidden ? 'none' : 'disc'; $('#showKey').textContent = hidden ? '隐藏' : '显示'; };
$('#saveKey').onclick = () => { LS.set('xai_key', $('#key').value.trim()); LS.set('xai_model', $('#model').value); toast('已保存'); };
$('#delKey').onclick = () => { if (confirm('确定删除已保存的密钥？')) { localStorage.removeItem('xai_key'); $('#key').value = ''; toast('密钥已删除'); } };
function toast(t) { const m = $('#msg'); m.innerHTML = ''; alert(t); }

// Templates
function renderTpl() {
  const list = LS.get('tpls', []);
  const box = $('#tplBox');
  box.innerHTML = list.length ? '<label>我的模板（点击使用）</label><div class="chips"></div>' : '';
  const chips = box.querySelector('.chips');
  list.forEach((t, i) => {
    const c = document.createElement('div'); c.className = 'chip';
    const s = document.createElement('span'); s.textContent = t; s.onclick = () => { $('#prompt').value = t; };
    const x = document.createElement('b'); x.textContent = '✕'; x.onclick = () => { if (confirm('删除这个模板？')) { list.splice(i, 1); LS.set('tpls', list); renderTpl(); } };
    c.append(s, x); chips.append(c);
  });
}
$('#saveTpl').onclick = () => {
  const p = $('#prompt').value.trim(); if (!p) return alert('请先输入提示词');
  const list = LS.get('tpls', []); if (!list.includes(p)) list.unshift(p); LS.set('tpls', list); renderTpl();
};
$('#clearPrompt').onclick = () => { $('#prompt').value = ''; };
renderTpl();

// Errors -> Chinese
function zhError(status, msg) {
  const map = {
    400: '请求无效（可能提示词不符合内容政策或参数有误）',
    401: 'API 密钥无效或已过期，请到“设置”检查',
    403: '没有权限（密钥无权使用此模型，或账户余额不足）',
    404: '接口或模型不存在',
    429: '请求太频繁或额度用完，请稍后再试',
    500: 'xAI 服务器错误，请稍后再试',
    502: 'xAI 服务暂时不可用', 503: 'xAI 服务暂时不可用'
  };
  if (/api key/i.test(msg || '')) return 'API 密钥无效，请到“设置”检查\n原始信息：' + msg;
  const base = map[status] || ('请求失败（状态码 ' + status + '）');
  return base + (msg ? '\n原始信息：' + msg : '');
}

// Generate
$('#go').onclick = async () => {
  const key = LS.get('xai_key', '');
  const prompt = $('#prompt').value.trim();
  const msg = $('#msg'); msg.innerHTML = '';
  if (!key) { msg.innerHTML = '<div class="err">请先在“设置”中填写 xAI API 密钥</div>'; return; }
  if (!prompt) { msg.innerHTML = '<div class="err">请输入图片描述</div>'; return; }
  const btn = $('#go'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>正在生成…';
  $('#results').innerHTML = '';
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model: LS.get('xai_model', 'grok-imagine-image-2.0'), prompt, n: count, response_format: 'b64_json' })
    });
    const text = await res.text();
    let data = null; try { data = JSON.parse(text); } catch (e) {}
    if (!res.ok) {
      const m = data && (data.error && (data.error.message || data.error) || data.message) || text;
      throw new Error(zhError(res.status, typeof m === 'string' ? m : JSON.stringify(m)));
    }
    const imgs = (data && data.data || []).map(d => d.b64_json ? 'data:image/jpeg;base64,' + d.b64_json : d.url).filter(Boolean);
    if (!imgs.length) throw new Error('没有返回图片（可能被内容审核拦截），请修改描述后重试');
    showGrid($('#results'), imgs);
    addHistory(prompt, imgs);
  } catch (e) {
    const t = e instanceof TypeError ? '网络错误：无法连接 api.x.ai，请检查网络（中国大陆可能需要代理）' : e.message;
    const d = document.createElement('div'); d.className = 'err'; d.textContent = t; msg.append(d);
  } finally { btn.disabled = false; btn.textContent = '生成图片'; }
};

function showGrid(el, imgs) {
  imgs.forEach(src => { const i = document.createElement('img'); i.src = src; i.loading = 'lazy'; i.onclick = () => openViewer(src); el.append(i); });
}

// History
function addHistory(prompt, imgs) {
  let h = LS.get('hist', []);
  h.unshift({ prompt, imgs, t: Date.now() });
  while (h.length) {
    try { LS.set('hist', h); return; } catch (e) { h.pop(); } // storage full: drop oldest
  }
}
function renderHistory() {
  const h = LS.get('hist', []); const list = $('#histList'); list.innerHTML = '';
  $('#histInfo').textContent = h.length ? '共 ' + h.length + ' 条（存储满时自动删除最旧的）' : '暂无历史记录';
  h.forEach(item => {
    const d = document.createElement('div'); d.className = 'hist';
    const p = document.createElement('p'); p.textContent = new Date(item.t).toLocaleString('zh-CN') + '  ' + item.prompt;
    p.onclick = () => { $('#prompt').value = item.prompt; tab('gen'); };
    const g = document.createElement('div'); g.className = 'grid'; showGrid(g, item.imgs);
    d.append(p, g); list.append(d);
  });
}
$('#clearHist').onclick = () => { if (confirm('确定清空全部历史记录？')) { localStorage.removeItem('hist'); renderHistory(); } };

// Viewer
let cur = '';
function openViewer(src) { cur = src; $('#vimg').src = src; $('#viewer').classList.add('on'); }
$('#vclose').onclick = () => $('#viewer').classList.remove('on');
$('#vsave').onclick = async () => {
  try {
    const blob = await (await fetch(cur)).blob();
    const file = new File([blob], 'grok-' + Date.now() + '.jpg', { type: blob.type || 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) { if (e.name !== 'AbortError') alert('保存失败，请长按图片保存'); }
};

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
