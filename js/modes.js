/*
 * Timer3 display modes.
 *
 * Each mode exposes { id, name, icon, create(container) } and create() returns
 * { update(state), destroy() }. The state passed to update() is:
 *   remaining  ms left (negative while counting overtime)
 *   duration   total ms
 *   fraction   remaining / duration, clamped to 0..1
 *   text       formatted time, e.g. "09:42", "1:05:00", "+00:12"
 *   phase      'idle' | 'running' | 'paused' | 'done'
 *   level      'normal' | 'warning' | 'critical' | 'done'
 *   sub        short caption, e.g. "remaining", "paused"
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let uid = 0;

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  /* Cache-aware setters keep per-frame DOM writes to a minimum. */
  function textSetter(node) {
    let last = null;
    return (v) => { if (v !== last) { node.textContent = v; last = v; } };
  }

  function attrSetter(node, name) {
    let last = null;
    return (v) => { if (v !== last) { node.setAttribute(name, v); last = v; } };
  }

  /* ---------- 1. Digital ---------- */
  const digital = {
    id: 'digital',
    name: 'Digital',
    icon: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M8 10v4M12 10v4M16 10v4"/>',
    create(root) {
      const node = el(`
        <div class="mode m-digital">
          <div class="digits" aria-hidden="true"></div>
          <div class="track"><div class="fill"></div></div>
        </div>`);
      root.appendChild(node);
      const setText = textSetter(node.querySelector('.digits'));
      const fill = node.querySelector('.fill');
      return {
        update(s) {
          setText(s.text);
          fill.style.transform = `scaleX(${s.fraction})`;
        },
        destroy() { node.remove(); }
      };
    }
  };

  /* ---------- 2. Progress ring ---------- */
  const ring = {
    id: 'ring',
    name: 'Ring',
    icon: '<circle cx="12" cy="12" r="8" opacity=".35"/><path d="M12 4a8 8 0 0 1 8 8"/>',
    create(root) {
      const r = 96, cx = 110, C = TAU * r;
      let ticks = '';
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * TAU - Math.PI / 2;
        const major = i % 5 === 0;
        const r1 = major ? 103 : 105.5, r2 = 108.5;
        ticks += `<line class="${major ? 'major' : ''}" x1="${(cx + r1 * Math.cos(a)).toFixed(2)}" y1="${(cx + r1 * Math.sin(a)).toFixed(2)}" x2="${(cx + r2 * Math.cos(a)).toFixed(2)}" y2="${(cx + r2 * Math.sin(a)).toFixed(2)}"/>`;
      }
      const node = el(`
        <div class="mode m-ring">
          <svg viewBox="0 0 220 220" aria-hidden="true">
            <g class="ticks">${ticks}</g>
            <circle class="ring-track" cx="${cx}" cy="${cx}" r="${r}"/>
            <circle class="prog" cx="${cx}" cy="${cx}" r="${r}" transform="rotate(-90 ${cx} ${cx})"
                    stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="0"/>
            <circle class="head" cx="${cx}" cy="${cx - r}" r="6.5"/>
          </svg>
          <div class="center">
            <div class="digits" aria-hidden="true"></div>
            <div class="sub" aria-hidden="true"></div>
          </div>
        </div>`);
      root.appendChild(node);
      const prog = node.querySelector('.prog');
      const head = node.querySelector('.head');
      const setText = textSetter(node.querySelector('.digits'));
      const setSub = textSetter(node.querySelector('.sub'));
      return {
        update(s) {
          const f = s.fraction;
          prog.style.strokeDashoffset = (C * (1 - f)).toFixed(2);
          prog.style.opacity = f > 0.0005 ? 1 : 0;
          const a = f * TAU - Math.PI / 2;
          head.setAttribute('cx', (cx + r * Math.cos(a)).toFixed(2));
          head.setAttribute('cy', (cx + r * Math.sin(a)).toFixed(2));
          head.style.opacity = f > 0.0005 ? 1 : 0;
          setText(s.text);
          setSub(s.sub);
        },
        destroy() { node.remove(); }
      };
    }
  };

  /* ---------- 3. Flip clock ---------- */
  const flip = {
    id: 'flip',
    name: 'Flip clock',
    icon: '<rect x="3" y="5" width="8" height="14" rx="1.5"/><rect x="13" y="5" width="8" height="14" rx="1.5"/><path d="M3 12h8M13 12h8"/>',
    create(root) {
      const node = el(`
        <div class="mode m-flip">
          <div class="flip-row" aria-hidden="true"></div>
          <div class="track"><div class="fill"></div></div>
        </div>`);
      root.appendChild(node);
      const row = node.querySelector('.flip-row');
      const fill = node.querySelector('.fill');
      let layout = '';
      let cards = [];

      function makeCard(v) {
        const c = el(`
          <div class="flip-card">
            <div class="half top"><span>${v}</span></div>
            <div class="half bottom"><span>${v}</span></div>
            <div class="flap ftop"><span>${v}</span></div>
            <div class="flap fbot"><span>${v}</span></div>
          </div>`);
        c._v = v;
        c._spans = [...c.querySelectorAll('span')];
        c.querySelector('.fbot').addEventListener('animationend', () => {
          c._spans[1].textContent = c._v;
          c.classList.remove('flipping');
        });
        return c;
      }

      function setCard(c, v, animate) {
        if (c._v === v) return;
        const old = c._v;
        c._v = v;
        const [top, bottom, ftop, fbot] = c._spans;
        if (!animate) {
          c.classList.remove('flipping');
          top.textContent = bottom.textContent = ftop.textContent = fbot.textContent = v;
          return;
        }
        top.textContent = v;      // revealed behind the falling flap
        bottom.textContent = old; // covered once the lower flap lands
        ftop.textContent = old;
        fbot.textContent = v;
        c.classList.remove('flipping');
        void c.offsetWidth;       // restart the animation
        c.classList.add('flipping');
      }

      function build(text) {
        row.textContent = '';
        cards = [];
        let digits = 0;
        for (const ch of text) {
          if (/\d/.test(ch)) {
            const c = makeCard(ch);
            cards.push(c);
            row.appendChild(c);
            digits++;
          } else {
            row.appendChild(el(`<span class="flip-sep">${ch === ':' ? '' : ch}</span>`))
              .classList.toggle('colon', ch === ':');
          }
        }
        node.style.setProperty('--n', digits);
      }

      return {
        update(s) {
          const pattern = s.text.replace(/\d/g, '0');
          if (pattern !== layout) {
            layout = pattern;
            build(s.text);
          } else {
            const animate = !reducedMotion.matches;
            let i = 0;
            for (const ch of s.text) {
              if (/\d/.test(ch)) setCard(cards[i++], ch, animate);
            }
          }
          fill.style.transform = `scaleX(${s.fraction})`;
        },
        destroy() { node.remove(); }
      };
    }
  };

  /* ---------- 4. Hourglass ---------- */
  const hourglass = {
    id: 'hourglass',
    name: 'Hourglass',
    icon: '<path d="M6 3h12M6 21h12M7.5 3c0 5 4.5 6 4.5 9s-4.5 4-4.5 9M16.5 3c0 5-4.5 6-4.5 9s4.5 4 4.5 9"/>',
    create(root) {
      const id = `hg${++uid}`;
      const glass = 'M30,18 C30,78 63,96 66,110 C63,124 30,142 30,202 L110,202 C110,142 77,124 74,110 C77,96 110,78 110,18 Z';
      const node = el(`
        <div class="mode m-hourglass">
          <svg class="hg" viewBox="0 0 140 220" aria-hidden="true">
            <defs>
              <clipPath id="${id}-clip"><path d="${glass}"/></clipPath>
              <linearGradient id="${id}-shine" x1="0" x2="1">
                <stop offset="0" stop-color="#fff" stop-opacity=".0"/>
                <stop offset=".25" stop-color="#fff" stop-opacity=".35"/>
                <stop offset=".45" stop-color="#fff" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <path class="glass-fill" d="${glass}"/>
            <g clip-path="url(#${id}-clip)">
              <rect class="sand sand-top" x="0" y="30" width="140" height="80"/>
              <path class="sand sand-bottom" d="M0,202 L140,202 Z"/>
              <line class="stream" x1="70" y1="108" x2="70" y2="202"/>
            </g>
            <path class="glass-line" d="${glass}"/>
            <path d="${glass}" fill="url(#${id}-shine)"/>
            <rect class="frame" x="10" y="6" width="120" height="12" rx="4"/>
            <rect class="frame" x="10" y="202" width="120" height="12" rx="4"/>
            <rect class="frame post" x="15" y="18" width="5" height="184" rx="2"/>
            <rect class="frame post" x="120" y="18" width="5" height="184" rx="2"/>
          </svg>
          <div class="digits" aria-hidden="true"></div>
        </div>`);
      root.appendChild(node);
      const top = node.querySelector('.sand-top');
      const bottom = node.querySelector('.sand-bottom');
      const stream = node.querySelector('.stream');
      const setText = textSetter(node.querySelector('.digits'));
      const setTopY = attrSetter(top, 'y');
      const setTopH = attrSetter(top, 'height');
      const setBottom = attrSetter(bottom, 'd');
      return {
        update(s) {
          const f = s.fraction;
          // The upper bulb narrows toward the neck, so ease the surface so the
          // drop accelerates near the end the way real sand appears to.
          const surface = 110 - 78 * Math.pow(f, 0.75);
          setTopY(surface.toFixed(2));
          setTopH((110 - surface).toFixed(2));

          const filled = 1 - f;
          const pileTop = 202 - 74 * Math.pow(filled, 0.85);
          const peak = 12 * Math.min(1, filled * 6);
          setBottom(`M0,202 L0,${pileTop.toFixed(2)} Q70,${(pileTop - 2 * peak).toFixed(2)} 140,${pileTop.toFixed(2)} L140,202 Z`);

          stream.setAttribute('y2', (pileTop - peak).toFixed(2));
          stream.classList.toggle('flowing', s.phase === 'running' && f > 0);
          setText(s.text);
        },
        destroy() { node.remove(); }
      };
    }
  };

  /* ---------- 5. Liquid tank ---------- */
  const liquid = {
    id: 'liquid',
    name: 'Liquid',
    icon: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M5 13.5c2.3-1.6 4.7 1.6 7 0s4.7 1.6 7 0"/>',
    create(root) {
      const wave = 'M0,20 C150,0 150,40 300,20 C450,0 450,40 600,20 C750,0 750,40 900,20 C1050,0 1050,40 1200,20 L1200,40 L0,40 Z';
      const bubbles = [
        [12, 0, 6.5], [27, 2.1, 5.2], [41, 4.0, 7.4], [58, 1.2, 5.8], [72, 3.3, 6.8], [86, 0.6, 5.5]
      ].map(([x, d, t]) => `<span class="bubble" style="--x:${x}%;--d:${d}s;--t:${t}s"></span>`).join('');
      const node = el(`
        <div class="mode m-liquid">
          <div class="tank">
            <div class="gauge" aria-hidden="true"><i></i><i></i><i></i></div>
            <div class="water">
              <svg class="wave w1" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true"><path d="${wave}"/></svg>
              <svg class="wave w2" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true"><path d="${wave}"/></svg>
              ${bubbles}
            </div>
            <div class="lq-text outer" aria-hidden="true"><span class="digits"></span></div>
            <div class="lq-text inner" aria-hidden="true"><span class="digits"></span></div>
          </div>
        </div>`);
      root.appendChild(node);
      const water = node.querySelector('.water');
      const inner = node.querySelector('.lq-text.inner');
      const setOuter = textSetter(node.querySelector('.outer .digits'));
      const setInner = textSetter(node.querySelector('.inner .digits'));
      return {
        update(s) {
          const pct = s.fraction * 100;
          water.style.height = `${pct}%`;
          water.classList.toggle('empty', s.fraction < 0.002);
          // Clip at the mid-height of the wave so the light/dark text split
          // tracks the visible surface rather than the flat top of the water.
          inner.style.clipPath = `inset(calc(${(100 - pct).toFixed(2)}% - var(--wave-mid)) 0 0 0)`;
          setOuter(s.text);
          setInner(s.text);
        },
        destroy() { node.remove(); }
      };
    }
  };

  /* ---------- 6. Pie (visual time disc) ---------- */
  const pie = {
    id: 'pie',
    name: 'Time disc',
    icon: '<circle cx="12" cy="12" r="9"/><path d="M12 12V3a9 9 0 0 1 8.6 11.7z" fill="currentColor" stroke="none"/>',
    create(root) {
      const R = 84;
      let ticks = '';
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * TAU;
        const major = i % 5 === 0;
        const r1 = major ? 88 : 92, r2 = 97;
        ticks += `<line class="${major ? 'major' : ''}" x1="${(r1 * Math.sin(a)).toFixed(2)}" y1="${(-r1 * Math.cos(a)).toFixed(2)}" x2="${(r2 * Math.sin(a)).toFixed(2)}" y2="${(-r2 * Math.cos(a)).toFixed(2)}"/>`;
      }
      const node = el(`
        <div class="mode m-pie">
          <svg viewBox="-110 -110 220 220" aria-hidden="true">
            <circle class="face" r="104"/>
            <g class="ticks">${ticks}</g>
            <path class="sector" d=""/>
            <circle class="knob" r="11"/>
          </svg>
          <div class="digits" aria-hidden="true"></div>
        </div>`);
      root.appendChild(node);
      const setD = attrSetter(node.querySelector('.sector'), 'd');
      const setText = textSetter(node.querySelector('.digits'));
      return {
        update(s) {
          const f = s.fraction;
          let d = '';
          if (f >= 0.9999) {
            d = `M0,${-R} A${R},${R} 0 1 1 0,${R} A${R},${R} 0 1 1 0,${-R} Z`;
          } else if (f > 0.0005) {
            const a = f * TAU;
            const x = (R * Math.sin(a)).toFixed(2);
            const y = (-R * Math.cos(a)).toFixed(2);
            d = `M0,0 L0,${-R} A${R},${R} 0 ${a > Math.PI ? 1 : 0} 1 ${x},${y} Z`;
          }
          setD(d);
          setText(s.text);
        },
        destroy() { node.remove(); }
      };
    }
  };

  window.TimerModes = [ring, digital, flip, hourglass, liquid, pie];
})();
