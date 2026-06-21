import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────
const W = 800, H = 600;
const PR = 16, ER = 14, BR = 4, PUR = 11;
const BASE_SPD = 3, BASE_ENEMY_SPD = 1.2, BULLET_SPD = 7;
const PU_DUR = 8000, GUN_RANGE = 350, GUN_CD = 350;
const MAX_ENEMIES = 60;

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#0d0700', grid: '#1a0e00',
  player: '#00e5ff', pDark: '#004d57',
  enemy: '#ff5722', eDark: '#bf360c',
  bullet: '#ffd700', gold: '#cd853f',
  text: '#14f195', earth: '#8b6f47', dark: '#5c4033',
  hpRed: '#e53935', hpBg: '#3e0000',
  speed: '#76ff03', shield: '#64b5f6', weapon: '#ffd700', heal: '#ff4081',
};

const PU_TYPES = ['speed', 'shield', 'weapon', 'heal'];
const PU_COL = { speed: C.speed, shield: C.shield, weapon: C.weapon, heal: C.heal };
const PU_LBL = { speed: 'SPD', shield: 'SHD', weapon: 'GUN', heal: 'HP+' };

// ─── Persistence ─────────────────────────────────────────────────────────────
const loadLB = () => { try { return JSON.parse(localStorage.getItem('pumppit_lb') || '[]'); } catch { return []; } };
const saveLB = lb => { try { localStorage.setItem('pumppit_lb', JSON.stringify(lb)); } catch {} };

// ─── Canvas pixel-rect helper ─────────────────────────────────────────────────
function pxr(ctx, x, y, w, h, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.fillRect(~~x, ~~y, w, h);
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.strokeRect(~~x + 1, ~~y + 1, w - 2, h - 2); }
}

// ─── Game State Factory ───────────────────────────────────────────────────────
const mkState = () => ({
  px: W / 2, py: H / 2, hp: 100, maxHp: 100,
  spd: BASE_SPD, invTimer: 0, shield: false, gun: false, gunCd: 0,
  enemies: [], bullets: [], powerUps: [], particles: [], activePUs: [],
  score: 0, killed: 0, timeAlive: 0,
  lastSpawn: 0, lastPU: 0, t: 0, dead: false,
});

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PumpPit() {
  const cvs  = useRef(null);
  const gsr  = useRef(null);
  const keys = useRef({});
  const raf  = useRef(null);

  const [phase,  setPhase]  = useState('menu');
  const [result, setResult] = useState({ score: 0, tokens: 0 });
  const [lb,     setLb]     = useState(loadLB);

  const endGame = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const g = gsr.current;
    const score  = g.score;
    const tokens = Math.floor(score / 10);
    setLb(prev => {
      const next = [...prev, { score, tokens, date: new Date().toLocaleDateString() }]
        .sort((a, b) => b.score - a.score).slice(0, 10);
      saveLB(next);
      return next;
    });
    setResult({ score, tokens });
    setPhase('over');
  }, []);

  const startGame = useCallback(() => {
    cancelAnimationFrame(raf.current);
    gsr.current = mkState();
    setPhase('playing');
  }, []);

  // ─── Keys ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const dn = e => {
      keys.current[e.key] = true;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    };
    const up = e => { keys.current[e.key] = false; };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, []);

  // ─── Game Loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;
    const canvas = cvs.current;
    const ctx    = canvas.getContext('2d');

    const spawnE = (g) => {
      const side = (Math.random() * 4) | 0;
      let x, y;
      if      (side === 0) { x = Math.random() * W; y = -22; }
      else if (side === 1) { x = W + 22; y = Math.random() * H; }
      else if (side === 2) { x = Math.random() * W; y = H + 22; }
      else                 { x = -22; y = Math.random() * H; }
      const diff = Math.min(g.timeAlive / 60, 2);
      g.enemies.push({ x, y, spd: BASE_ENEMY_SPD * (1 + diff * 0.5) });
    };

    const burst = (g, x, y, color, n = 8) => {
      for (let i = 0; i < n; i++) {
        const a = Math.PI * 2 * i / n + Math.random() * 0.6;
        const s = 1 + Math.random() * 3;
        g.particles.push({ x, y, dx: Math.cos(a) * s, dy: Math.sin(a) * s, color, sz: 3 + Math.random() * 5, life: 28, max: 28 });
      }
    };

    // ── Draw helpers ────────────────────────────────────────────────────────
    const drawBg = (g) => {
      const lowHp = g.hp <= 30;
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = lowHp ? '#3a0000' : C.grid;
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      if (lowHp) {
        const grd = ctx.createRadialGradient(W/2, H/2, H*0.3, W/2, H/2, H*0.8);
        grd.addColorStop(0, 'transparent');
        grd.addColorStop(1, 'rgba(200,0,0,0.18)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, W, H);
      }
    };

    const drawPlayer = (g, ts) => {
      if (g.invTimer > 0 && ((ts / 80) | 0) % 2) return;
      const { px: x, py: y, shield, gun } = g;
      if (shield) {
        ctx.strokeStyle = C.shield; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, PR + 9, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = C.shield + '44'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, PR + 13, 0, Math.PI * 2); ctx.stroke();
      }
      if (gun) {
        ctx.strokeStyle = C.gold + '33'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(x, y, GUN_RANGE, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      pxr(ctx, x - PR, y - PR, PR * 2, PR * 2, C.player, C.pDark);
      // face
      ctx.fillStyle = '#001f3f';
      ctx.fillRect(~~(x - 10), ~~(y - 6), 7, 7); ctx.fillRect(~~(x + 3), ~~(y - 6), 7, 7);
      ctx.fillStyle = '#7fffff';
      ctx.fillRect(~~(x - 9), ~~(y - 5), 3, 3); ctx.fillRect(~~(x + 4), ~~(y - 5), 3, 3);
      ctx.fillStyle = '#001f3f';
      ctx.fillRect(~~(x - 7), ~~(y + 5), 14, 3);
    };

    const drawEnemy = (e) => {
      const { x, y } = e;
      pxr(ctx, x - ER, y - ER, ER * 2, ER * 2, C.enemy, C.eDark);
      ctx.fillStyle = '#ffeb3b';
      ctx.fillRect(~~(x - 9), ~~(y - 6), 6, 6); ctx.fillRect(~~(x + 3), ~~(y - 6), 6, 6);
      ctx.fillStyle = '#000';
      ctx.fillRect(~~(x - 8), ~~(y - 5), 4, 4); ctx.fillRect(~~(x + 4), ~~(y - 5), 4, 4);
      ctx.fillRect(~~(x - 7), ~~(y + 4), 14, 4);
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 3; i++) ctx.fillRect(~~(x - 6 + i * 4), ~~(y + 4), 3, 4);
    };

    const drawBullet = (b) => {
      ctx.shadowColor = C.bullet; ctx.shadowBlur = 8;
      ctx.fillStyle = C.bullet; ctx.fillRect(~~(b.x - BR), ~~(b.y - BR), BR * 2, BR * 2);
      ctx.fillStyle = '#fff'; ctx.fillRect(~~(b.x - 1), ~~(b.y - 1), 2, 2);
      ctx.shadowBlur = 0;
    };

    const drawPU = (p, ts) => {
      const fy = Math.sin(ts / 350) * 4;
      ctx.shadowColor = PU_COL[p.type]; ctx.shadowBlur = 14;
      pxr(ctx, p.x - PUR, p.y - PUR + fy, PUR * 2, PUR * 2, PU_COL[p.type], '#fff6');
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#000'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
      ctx.fillText(PU_LBL[p.type], p.x, p.y + 4 + fy);
    };

    const drawHUD = (g, ts) => {
      // HP bar
      ctx.fillStyle = C.hpBg; ctx.fillRect(10, 10, 200, 24);
      const pct = g.hp / g.maxHp;
      ctx.fillStyle = pct > 0.5 ? C.hpRed : pct > 0.25 ? '#ff9800' : '#ff1744';
      ctx.fillRect(10, 10, ~~(200 * pct), 24);
      ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.strokeRect(10, 10, 200, 24);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`HP ${g.hp}/${g.maxHp}`, 110, 27);

      ctx.textAlign = 'left';
      ctx.fillStyle = C.text; ctx.font = 'bold 14px monospace';
      ctx.fillText(`⏱ ${Math.floor(g.timeAlive)}s`, 10, 54);
      ctx.fillStyle = '#777'; ctx.font = '12px monospace';
      ctx.fillText(`Kills: ${g.killed}`, 10, 70);

      ctx.textAlign = 'right';
      ctx.fillStyle = C.gold; ctx.font = 'bold 18px monospace';
      ctx.fillText(`${g.score} PTS`, W - 10, 28);
      ctx.fillStyle = C.text; ctx.font = '11px monospace';
      ctx.fillText(`${Math.floor(g.score / 10)} $PUMP`, W - 10, 44);

      // Active power-ups icons
      g.activePUs.forEach((pu, i) => {
        const bx = W - 64, by = 52 + i * 30;
        ctx.fillStyle = PU_COL[pu.type]; ctx.fillRect(bx, by, 22, 22);
        ctx.fillStyle = '#000'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
        ctx.fillText(PU_LBL[pu.type], bx + 11, by + 15);
        ctx.textAlign = 'right'; ctx.fillStyle = C.text; ctx.font = '11px monospace';
        const lbl = pu.type === 'shield' ? 'ON' : `${Math.max(0, (pu.end - ts) / 1000).toFixed(1)}s`;
        ctx.fillText(lbl, bx - 4, by + 15);
      });

      // Difficulty wave label
      const wave = Math.min(Math.floor(g.timeAlive / 15) + 1, 10);
      ctx.textAlign = 'left'; ctx.fillStyle = C.earth; ctx.font = 'bold 11px monospace';
      ctx.fillText(`WAVE ${wave}`, 10, 86);
    };

    // ── Tick ────────────────────────────────────────────────────────────────
    const tick = (ts) => {
      const g = gsr.current;
      if (!g || g.dead) return;

      const dt = g.t === 0 ? 16 : Math.min(ts - g.t, 50);
      g.t = ts;
      const f = dt / 16.67;

      g.timeAlive += dt / 1000;
      g.score = Math.floor(g.timeAlive) + g.killed * 10;

      // Expire timed power-ups
      g.activePUs = g.activePUs.filter(pu => {
        if (pu.end !== Infinity && ts >= pu.end) {
          if (pu.type === 'speed')  g.spd = BASE_SPD;
          if (pu.type === 'weapon') g.gun = false;
          return false;
        }
        return true;
      });

      // Player movement
      const sp = g.spd * f;
      const k  = keys.current;
      if (k['ArrowLeft']  || k['a'] || k['A']) g.px = Math.max(PR, g.px - sp);
      if (k['ArrowRight'] || k['d'] || k['D']) g.px = Math.min(W - PR, g.px + sp);
      if (k['ArrowUp']    || k['w'] || k['W']) g.py = Math.max(PR, g.py - sp);
      if (k['ArrowDown']  || k['s'] || k['S']) g.py = Math.min(H - PR, g.py + sp);
      if (g.invTimer > 0) g.invTimer -= dt;

      // Spawn enemies
      const diff    = Math.min(g.timeAlive / 60, 2);
      const spawnMs = Math.max(400, 2000 - diff * 800);
      if (ts - g.lastSpawn > spawnMs) {
        if (g.enemies.length < MAX_ENEMIES) spawnE(g);
        if (g.timeAlive > 20 && g.enemies.length < MAX_ENEMIES && Math.random() < 0.5) spawnE(g);
        if (g.timeAlive > 45 && g.enemies.length < MAX_ENEMIES && Math.random() < 0.5) spawnE(g);
        if (g.timeAlive > 80 && g.enemies.length < MAX_ENEMIES && Math.random() < 0.4) spawnE(g);
        g.lastSpawn = ts;
      }

      // Spawn power-ups (first at ~8s game time, then every ~12s)
      if (g.timeAlive > 8 && (g.lastPU === 0 || ts - g.lastPU > 12000)) {
        const type = PU_TYPES[(Math.random() * PU_TYPES.length) | 0];
        g.powerUps.push({ x: 60 + Math.random() * (W - 120), y: 60 + Math.random() * (H - 120), type });
        g.lastPU = ts;
      }

      // Move enemies toward player
      g.enemies.forEach(e => {
        const dx = g.px - e.x, dy = g.py - e.y;
        const d  = Math.hypot(dx, dy) || 1;
        e.x += (dx / d) * e.spd * f;
        e.y += (dy / d) * e.spd * f;
      });

      // Move bullets
      g.bullets.forEach(b => { b.x += b.dx * f; b.y += b.dy * f; });
      g.bullets = g.bullets.filter(b => b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20);

      // Auto-gun: shoot nearest enemy in range
      if (g.gun) {
        g.gunCd -= dt;
        if (g.gunCd <= 0) {
          let near = null, nd = GUN_RANGE;
          g.enemies.forEach(e => {
            const d = Math.hypot(e.x - g.px, e.y - g.py);
            if (d < nd) { nd = d; near = e; }
          });
          if (near) {
            const dx = near.x - g.px, dy = near.y - g.py;
            const d  = Math.hypot(dx, dy) || 1;
            g.bullets.push({ x: g.px, y: g.py, dx: dx / d * BULLET_SPD, dy: dy / d * BULLET_SPD });
            g.gunCd = GUN_CD;
          } else {
            g.gunCd = 100; // retry sooner when no target
          }
        }
      }

      // Bullet ↔ enemy collisions
      const dB = new Set(), dE = new Set();
      g.bullets.forEach((b, bi) => {
        if (dB.has(bi)) return;
        g.enemies.forEach((e, ei) => {
          if (dE.has(ei)) return;
          if (Math.abs(b.x - e.x) < ER + BR && Math.abs(b.y - e.y) < ER + BR) {
            dB.add(bi); dE.add(ei);
            g.killed++;
            burst(g, e.x, e.y, C.enemy);
          }
        });
      });
      g.bullets = g.bullets.filter((_, i) => !dB.has(i));

      // Enemy ↔ player collisions (invincibility window after hit)
      if (g.invTimer <= 0) {
        g.enemies.forEach((e, ei) => {
          if (dE.has(ei)) return;
          if (Math.abs(e.x - g.px) < PR + ER - 2 && Math.abs(e.y - g.py) < PR + ER - 2) {
            dE.add(ei);
            if (g.shield) {
              g.shield = false;
              g.activePUs = g.activePUs.filter(p => p.type !== 'shield');
              burst(g, g.px, g.py, C.shield, 14);
            } else {
              g.hp -= 10;
              burst(g, g.px, g.py, '#ff1744', 8);
            }
            g.invTimer = 900;
            g.killed++;
            burst(g, e.x, e.y, C.enemy, 6);
          }
        });
      }
      g.enemies = g.enemies.filter((_, i) => !dE.has(i));

      // Player ↔ power-up pickup
      g.powerUps = g.powerUps.filter(pu => {
        if (Math.abs(pu.x - g.px) < PR + PUR + 4 && Math.abs(pu.y - g.py) < PR + PUR + 4) {
          burst(g, pu.x, pu.y, PU_COL[pu.type], 10);
          switch (pu.type) {
            case 'speed':
              g.spd = BASE_SPD * 1.8;
              g.activePUs = g.activePUs.filter(p => p.type !== 'speed');
              g.activePUs.push({ type: 'speed', end: ts + PU_DUR });
              break;
            case 'shield':
              g.shield = true;
              g.activePUs = g.activePUs.filter(p => p.type !== 'shield');
              g.activePUs.push({ type: 'shield', end: Infinity });
              break;
            case 'weapon':
              g.gun = true; g.gunCd = 0;
              g.activePUs = g.activePUs.filter(p => p.type !== 'weapon');
              g.activePUs.push({ type: 'weapon', end: ts + PU_DUR });
              break;
            case 'heal':
              g.hp = Math.min(g.maxHp, g.hp + 50);
              burst(g, g.px, g.py, C.heal, 12);
              break;
          }
          return false;
        }
        return true;
      });

      // Particles
      g.particles.forEach(p => { p.x += p.dx; p.y += p.dy; p.dx *= 0.87; p.dy *= 0.87; p.life--; });
      g.particles = g.particles.filter(p => p.life > 0);

      // Death check
      if (g.hp <= 0) { g.hp = 0; g.dead = true; endGame(); return; }

      // ── Render ────────────────────────────────────────────────────────────
      drawBg(g);
      g.powerUps.forEach(p  => drawPU(p, ts));
      g.bullets.forEach(b   => drawBullet(b));
      g.enemies.forEach(e   => drawEnemy(e));
      g.particles.forEach(p => {
        ctx.globalAlpha = p.life / p.max;
        ctx.fillStyle   = p.color;
        ctx.fillRect(~~(p.x - p.sz / 2), ~~(p.y - p.sz / 2), p.sz, p.sz);
        ctx.globalAlpha = 1;
      });
      drawPlayer(g, ts);
      drawHUD(g, ts);

      raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [phase, endGame]);

  // Draw static background for menu/over screens
  useEffect(() => {
    if (phase === 'playing') return;
    const ctx = cvs.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  }, [phase]);

  // ─── UI Styles ────────────────────────────────────────────────────────────
  const ov = {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(5,2,0,0.9)',
    fontFamily: '"Courier New", Courier, monospace',
    padding: '24px 32px', gap: 0, overflowY: 'auto',
  };

  const btnPrimary = {
    background: C.gold, color: '#000', border: `2px solid ${C.gold}`,
    padding: '11px 34px', fontSize: 15, fontFamily: '"Courier New", monospace',
    fontWeight: 'bold', cursor: 'pointer', letterSpacing: 2, marginTop: 10,
    transition: 'opacity 0.15s',
  };

  const btnSecondary = {
    ...btnPrimary,
    background: 'transparent', color: C.earth, borderColor: C.earth,
  };

  const LBTable = ({ highlight }) => (
    <div style={{ marginTop: 14, width: '100%', maxWidth: 400, border: `1px solid ${C.earth}`, padding: '10px 14px', background: '#1a0e0055' }}>
      <div style={{ color: C.gold, fontWeight: 'bold', marginBottom: 8, letterSpacing: 2, fontSize: 13 }}>🏆 LEADERBOARD</div>
      {lb.length === 0 && <div style={{ color: '#555', fontSize: 12 }}>No scores yet. Be the first!</div>}
      {lb.map((e, i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between', gap: 10,
          fontSize: 12, padding: '2px 0',
          color: e.score === highlight ? C.gold : i === 0 ? C.gold : C.text,
          fontWeight: e.score === highlight ? 'bold' : 'normal',
        }}>
          <span style={{ color: C.earth, minWidth: 24 }}>#{i + 1}</span>
          <span style={{ flex: 1 }}>{e.score} pts</span>
          <span style={{ color: C.gold }}>{e.tokens} $PUMP</span>
          <span style={{ color: '#555' }}>{e.date}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#060300', fontFamily: '"Courier New", monospace' }}>
      <div style={{ position: 'relative' }}>
        <canvas ref={cvs} width={W} height={H} style={{ display: 'block', border: `3px solid ${C.gold}` }} />

        {/* ── MENU ── */}
        {phase === 'menu' && (
          <div style={ov}>
            <div style={{ color: C.gold, fontSize: 50, fontWeight: 'bold', textShadow: `0 0 30px ${C.gold}`, letterSpacing: 4, marginBottom: 4 }}>
              ⛏ PUMP PIT
            </div>
            <div style={{ color: C.text, fontSize: 12, letterSpacing: 3, marginBottom: 14 }}>
              SURVIVE · COLLECT · EARN $PUMP
            </div>

            <div style={{ background: '#1a0e0099', border: `1px solid ${C.earth}`, padding: '12px 20px', fontSize: 13, color: '#aaa', lineHeight: 2, textAlign: 'center', marginBottom: 10 }}>
              <div>🎮 <b style={{ color: C.text }}>WASD / Arrow Keys</b> to move</div>
              <div>💀 Enemy touch = <b style={{ color: '#f44336' }}>−10 HP</b> · Reach 0 HP and it's over</div>
              <div>⚡ Grab power-ups to turn the tide</div>
              <div>💰 Score ÷ 10 = <b style={{ color: C.gold }}>$PUMP tokens</b> earned</div>
            </div>

            <div style={{ display: 'flex', gap: 18, marginBottom: 14 }}>
              {PU_TYPES.map(t => (
                <div key={t} style={{ textAlign: 'center', fontSize: 11 }}>
                  <div style={{ background: PU_COL[t], width: 28, height: 28, margin: '0 auto 5px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 'bold', color: '#000' }}>
                    {PU_LBL[t]}
                  </div>
                  <div style={{ color: PU_COL[t] }}>{t.toUpperCase()}</div>
                </div>
              ))}
            </div>

            <button onClick={startGame} style={btnPrimary}>▶ START GAME</button>
            <LBTable highlight={-1} />
          </div>
        )}

        {/* ── GAME OVER ── */}
        {phase === 'over' && (
          <div style={ov}>
            <div style={{ color: '#f44336', fontSize: 44, fontWeight: 'bold', textShadow: '0 0 24px #f44336', letterSpacing: 4, marginBottom: 6 }}>
              GAME OVER
            </div>
            <div style={{ color: '#aaa', fontSize: 16, marginBottom: 4 }}>
              Final Score: <span style={{ color: C.gold, fontWeight: 'bold', fontSize: 22 }}>{result.score}</span>
            </div>
            <div style={{ color: '#fff', fontSize: 22, marginBottom: 16, textShadow: `0 0 14px ${C.gold}` }}>
              You earned{' '}
              <span style={{ color: C.gold, fontWeight: 'bold' }}>{result.tokens} $PUMP</span>{' '}
              tokens!
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={startGame} style={btnPrimary}>▶ PLAY AGAIN</button>
              <button onClick={() => setPhase('menu')} style={btnSecondary}>MENU</button>
            </div>
            <LBTable highlight={result.score} />
          </div>
        )}
      </div>
      <div style={{ color: C.dark, fontSize: 11, marginTop: 8, letterSpacing: 1 }}>
        PUMP PIT v1.0 · React + Canvas
      </div>
    </div>
  );
}
