/* Shared shell: sidebar, header, Persian digits, lightweight SVG charts, modals/drawers.
   Prototype only — no network, no backend. */

var NAV = [
  { id: 'index',       label: 'خانه / نمای کلی',   ic: 'home' },
  { id: 'content',     label: 'محتوا و بسته‌ها',    ic: 'book' },
  { id: 'store',       label: 'فروشگاه',           ic: 'store' },
  { id: 'users',       label: 'کاربران',           ic: 'users' },
  { id: 'learning',    label: 'یادگیری',           ic: 'chart' },
  { id: 'presentation',label: 'نمایش اپ',          ic: 'image' },
  { id: 'access',      label: 'نشست‌ها و دسترسی',  ic: 'shield' },
  { id: 'operations',  label: 'عملیات',            ic: 'ops' },
  { id: 'settings',    label: 'تنظیمات',           ic: 'settings' }
];

/* ---- Persian digits ---- */
var FA = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
function fa(v) {
  return String(v).replace(/\d/g, function (d) { return FA[+d]; });
}
function faNum(n) {
  return fa(Number(n).toLocaleString('en-US'));
}
function toman(n) { return faNum(n) + ' تومان'; }

/* ---- shell render ---- */
function renderShell(active) {
  var nav = NAV.map(function (n) {
    return '<a class="nav-item' + (n.id === active ? ' active' : '') + '" href="' + n.id + '.html">' +
      '<span class="ic">' + ICONS[n.ic] + '</span><span>' + n.label + '</span></a>';
  }).join('');

  return '' +
  '<aside class="sidebar">' +
    '<div class="brand">' +
      '<div class="brand-mark">' + ICONS.diamond + '</div>' +
      '<div class="brand-name">LearnBox</div>' +
    '</div>' +
    '<nav class="nav">' + nav + '</nav>' +
    '<div class="sidebar-foot">' +
      '<div class="bobo-card">' +
        '<div class="bobo-bubble">با هم آلمانی را آسان‌تر می‌کنیم.' +
          '<span class="bobo-heart">♥</span></div>' +
        '<img src="assets/img/bobo-welcome.png" alt="Bobo">' +
      '</div>' +
      '<div class="sidebar-meta"><b>LearnBox Admin</b><br>v0.1.0 (prototype)' +
        '<span class="dot-live"></span></div>' +
    '</div>' +
  '</aside>';
}

function renderTopbar(opts) {
  opts = opts || {};
  var title = opts.title || 'سلام بهرام! 👋';
  var sub = opts.sub || 'خوش آمدی به اتاق کنترل LearnBox';
  return '' +
  '<header class="topbar">' +
    '<div class="greet"><h1>' + title + '</h1><p>' + sub + '</p></div>' +
    '<div class="search" role="search">' +
      '<span class="kbd">⌘K</span>' +
      '<span class="grow">جستجو در کاربران، بسته‌ها، کلمات و …</span>' +
      ICONS.search +
    '</div>' +
    '<button class="icon-btn" data-toast="اعلان جدیدی وجود ندارد.">' +
      ICONS.bell + '<span class="badge-dot"></span></button>' +
    '<div class="user-chip">' +
      '<div class="avatar">ب‌ق</div>' +
      '<div><div class="u-name">بهرام قربانی</div><div class="u-role">مدیر ارشد</div></div>' +
      '<span class="caret">' + ICONS.chevronDown + '</span>' +
    '</div>' +
  '</header>';
}

/* page bootstrap: injects sidebar + topbar, then Persian-digit pass */
function mount(active, opts) {
  var root = document.getElementById('app');
  var head = document.getElementById('page');
  root.insertAdjacentHTML('afterbegin', renderShell(active));
  if (head) head.insertAdjacentHTML('afterbegin', renderTopbar(opts));
  document.documentElement.lang = 'fa';
  document.documentElement.dir = 'rtl';
  wireToasts();
}

/* ---- charts (inline SVG, no library) ---- */
function areaChart(series, w, h) {
  w = w || 460; h = h || 150;
  var max = Math.max.apply(null, series) * 1.06;
  var min = Math.min.apply(null, series) * 0.88;
  var n = series.length;
  /* Time axis follows the approved concept: oldest at LEFT, newest at RIGHT,
     so the growth curve rises toward the right even inside the RTL page. */
  var px = function (i) { return (i / (n - 1)) * w; };
  var py = function (v) { return h - ((v - min) / (max - min)) * h; };

  var line = series.map(function (v, i) {
    return (i ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(v).toFixed(1);
  }).join(' ');
  var area = line + ' L' + px(n - 1).toFixed(1) + ' ' + h + ' L' + px(0).toFixed(1) + ' ' + h + ' Z';

  var mid = Math.floor(n / 2);
  return '' +
  '<svg viewBox="0 0 ' + w + ' ' + (h + 26) + '" preserveAspectRatio="none" style="height:172px">' +
    '<defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#6b42df" stop-opacity="0.26"/>' +
      '<stop offset="100%" stop-color="#6b42df" stop-opacity="0.02"/>' +
    '</linearGradient></defs>' +
    [0.25, 0.5, 0.75].map(function (g) {
      return '<line x1="0" y1="' + (h * g).toFixed(0) + '" x2="' + w + '" y2="' + (h * g).toFixed(0) +
        '" stroke="#f1f0f5" stroke-width="1"/>';
    }).join('') +
    '<path d="' + area + '" fill="url(#ag)"/>' +
    '<path d="' + line + '" fill="none" stroke="#6b42df" stroke-width="2.1" stroke-linejoin="round"/>' +
    '<circle cx="' + px(mid).toFixed(1) + '" cy="' + py(series[mid]).toFixed(1) + '" r="4" fill="#6b42df" stroke="#fff" stroke-width="2"/>' +
  '</svg>';
}

function barChart(pairs, w, h) {
  w = w || 400; h = h || 150;
  var maxA = Math.max.apply(null, pairs.map(function (p) { return p[1]; })) * 1.1;
  var n = pairs.length;
  var slot = w / n;
  var bw = Math.min(9, slot * 0.3);

  var bars = pairs.map(function (p, i) {
    var cx = (i + 0.5) * slot;                     // oldest left -> newest right
    var h1 = (p[0] / maxA) * h, h2 = (p[1] / maxA) * h;
    return '<rect x="' + (cx + 1.5).toFixed(1) + '" y="' + (h - h2).toFixed(1) + '" width="' + bw +
             '" height="' + h2.toFixed(1) + '" rx="2.5" fill="#c9b6ff"/>' +
           '<rect x="' + (cx - bw - 1.5).toFixed(1) + '" y="' + (h - h1).toFixed(1) + '" width="' + bw +
             '" height="' + h1.toFixed(1) + '" rx="2.5" fill="#6b42df"/>';
  }).join('');

  return '<svg viewBox="0 0 ' + w + ' ' + (h + 26) + '" preserveAspectRatio="none" style="height:172px">' +
    [0.33, 0.66].map(function (g) {
      return '<line x1="0" y1="' + (h * g).toFixed(0) + '" x2="' + w + '" y2="' + (h * g).toFixed(0) +
        '" stroke="#f1f0f5" stroke-width="1"/>';
    }).join('') + bars + '</svg>';
}

function donut(parts, centerTop, centerSub) {
  var r = 52, c = 2 * Math.PI * r, off = 0;
  var segs = parts.map(function (p) {
    var len = (p.v / 100) * c;
    var seg = '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="' + p.c +
      '" stroke-width="17" stroke-linecap="round" stroke-dasharray="' + (len - 4).toFixed(1) + ' ' +
      (c - len + 4).toFixed(1) + '" stroke-dashoffset="' + (-off).toFixed(1) + '" ' +
      'transform="rotate(-90 70 70)"/>';
    off += len;
    return seg;
  }).join('');

  return '<svg viewBox="0 0 140 140" style="width:140px;height:140px;flex:none">' + segs +
    '<text x="70" y="66" text-anchor="middle" font-size="16" font-weight="700" fill="#16182b">' + centerTop + '</text>' +
    '<text x="70" y="84" text-anchor="middle" font-size="10" fill="#6e7182">' + centerSub + '</text>' +
  '</svg>';
}

function axisRow(labels) {
  return '<div dir="ltr" style="display:flex;justify-content:space-between;padding:4px 2px 0;font-size:9.5px;color:#6e7182">' +
    labels.map(function (l) { return '<span>' + l + '</span>'; }).join('') + '</div>';
}

/* ---- modal / drawer / toast ---- */
function openModal(title, bodyHtml, footHtml) {
  closeOverlay();
  var el = document.createElement('div');
  el.className = 'scrim';
  el.id = 'overlay';
  el.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' +
    '<div class="modal-head"><h3>' + title + '</h3>' +
      '<button class="x-btn" onclick="closeOverlay()">' + ICONS.x + '</button></div>' +
    '<div class="modal-body">' + bodyHtml + '</div>' +
    (footHtml ? '<div class="modal-foot">' + footHtml + '</div>' : '') +
  '</div>';
  el.addEventListener('click', function (e) { if (e.target === el) closeOverlay(); });
  document.body.appendChild(el);
  faPass(el);
}

function openDrawer(title, bodyHtml) {
  closeOverlay();
  var s = document.createElement('div');
  s.className = 'drawer-scrim';
  s.id = 'overlay';
  s.onclick = closeOverlay;
  var d = document.createElement('aside');
  d.className = 'drawer';
  d.id = 'overlay2';
  d.innerHTML = '<div class="drawer-head"><h3 style="margin:0;font-size:14px">' + title + '</h3>' +
    '<button class="x-btn" onclick="closeOverlay()">' + ICONS.x + '</button></div>' +
    '<div class="drawer-body">' + bodyHtml + '</div>';
  document.body.appendChild(s);
  document.body.appendChild(d);
  faPass(d);
}

function closeOverlay() {
  ['overlay', 'overlay2'].forEach(function (id) {
    var e = document.getElementById(id);
    if (e) e.remove();
  });
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeOverlay();
});

function toast(msg) {
  var t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);' +
    'background:#16182b;color:#fff;padding:10px 18px;border-radius:12px;font-size:12px;' +
    'z-index:90;box-shadow:0 12px 40px rgba(22,24,43,.3);font-family:inherit';
  document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, 1900);
}

function wireToasts() {
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-toast]');
    if (el) toast(el.getAttribute('data-toast'));
  });
}

/* convert ASCII digits to Persian inside rendered markup (skips .ltr/.mono/code) */
function faPass(root) {
  root = root || document.body;
  var walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: function (n) {
      if (!/\d/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
      var p = n.parentElement;
      while (p && p !== root) {
        if (p.classList && (p.classList.contains('ltr') || p.classList.contains('mono') ||
            p.classList.contains('keep-latin'))) return NodeFilter.FILTER_REJECT;
        if (p.tagName === 'CODE' || p.tagName === 'SVG') return NodeFilter.FILTER_REJECT;
        p = p.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  var nodes = [], n;
  while ((n = walk.nextNode())) nodes.push(n);
  nodes.forEach(function (t) { t.nodeValue = fa(t.nodeValue); });
}

/* status helpers shared across screens */
function packBadge(state) {
  var m = {
    draft:     ['b-grey',  'پیش‌نویس'],
    review:    ['b-amber', 'در انتظار بررسی'],
    published: ['b-green', 'منتشر شده'],
    archived:  ['b-grey',  'بایگانی']
  }[state];
  return '<span class="badge ' + m[0] + '">' + m[1] + '</span>';
}

function userBadge(status) {
  var m = {
    active:    ['b-green', 'فعال'],
    inactive:  ['b-grey',  'غیرفعال'],
    suspended: ['b-rose',  'مسدود']
  }[status];
  return '<span class="badge ' + m[0] + '">' + m[1] + '</span>';
}
