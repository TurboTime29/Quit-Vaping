import { useEffect, useRef, useState } from 'react'

// Logical playfield; the canvas is scaled to fit the screen.
const W = 360
const H = 540
const PADDLE_Y = H - 64
const PADDLE_H = 12
const PADDLE_W = 76
const BALL_R = 6
const COLS = 8
const GAP = 4
const SIDE = 10
const TOP = 58
const BRICK_H = 18
const BRICK_W = (W - SIDE * 2 - GAP * (COLS - 1)) / COLS
const ROW_COLORS = ['#FF6B6B', '#FFA07A', '#F7B731', '#A3CB38', '#4ECDC4', '#45B7D1', '#6C5CE7', '#FD79A8']
const BEST_KEY = 'quit-game-best'
const MUTE_KEY = 'quit-game-muted'

type PowerKind = 'wide' | 'multi' | 'slow'
const POWER_LABEL: Record<PowerKind, string> = { wide: '↔', multi: '×3', slow: '🐢' }
const POWER_COLOR: Record<PowerKind, string> = { wide: '#4ECDC4', multi: '#F7B731', slow: '#6C5CE7' }

interface Brick { x: number; y: number; hp: number; max: number; color: string; flash: number }
interface Ball { x: number; y: number; vx: number; vy: number; trail: { x: number; y: number }[] }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface Drop { x: number; y: number; kind: PowerKind }
interface Floater { x: number; y: number; text: string; life: number; color: string }

type Phase = 'ready' | 'playing' | 'cleared' | 'over' | 'paused'

const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

/** Tiny Web Audio synth: short blips whose pitch climbs with the combo. */
class Sfx {
  private ctx: AudioContext | null = null
  muted = read(MUTE_KEY) === '1'
  unlock() {
    if (this.ctx) { void this.ctx.resume(); return }
    // "ambient" respects the iPhone silent switch and does not pause the user's music.
    const session = (navigator as { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'ambient'
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctor) this.ctx = new Ctor()
  }
  tone(freq: number, dur = 0.08, type: OscillatorType = 'square', vol = 0.06, delay = 0) {
    if (this.muted || !this.ctx) return
    const t = this.ctx.currentTime + delay
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    gain.gain.setValueAtTime(vol, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(gain).connect(this.ctx.destination)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }
}

function buildLevel(level: number): Brick[] {
  const rows = Math.min(4 + level, 8)
  const bricks: Brick[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < COLS; c++) {
      const pattern = level % 4
      // Vary the layout by level: full wall, pyramid, checkerboard, twin towers.
      if (pattern === 2 && c < Math.abs(rows - 1 - r) / 2 - 0.5) continue
      if (pattern === 2 && COLS - 1 - c < Math.abs(rows - 1 - r) / 2 - 0.5) continue
      if (pattern === 3 && (r + c) % 2 === 1) continue
      if (pattern === 0 && (c === 3 || c === 4) && r > 1) continue
      const tough = level >= 3 && r < Math.floor((level - 1) / 2) ? Math.min(3, 1 + Math.floor(level / 3)) : 1
      bricks.push({ x: SIDE + c * (BRICK_W + GAP), y: TOP + r * (BRICK_H + GAP), hp: tough, max: tough, color: ROW_COLORS[r % ROW_COLORS.length], flash: 0 })
    }
  }
  return bricks
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r)
  else ctx.rect(x, y, w, h)
}

export default function BrickBreaker() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [phase, setPhaseState] = useState<Phase>('ready')
  const [final, setFinal] = useState({ score: 0, best: Number(read(BEST_KEY) ?? 0), level: 1, newBest: false })
  const [muted, setMuted] = useState(() => read(MUTE_KEY) === '1')

  // All per-frame game state lives in a ref so the animation loop never re-renders React.
  const g = useRef({
    phase: 'ready' as Phase,
    level: 1,
    score: 0,
    lives: 3,
    combo: 0,
    best: Number(read(BEST_KEY) ?? 0),
    paddleX: W / 2,
    targetX: W / 2,
    paddleW: PADDLE_W,
    wideUntil: 0,
    slowUntil: 0,
    balls: [] as Ball[],
    bricks: buildLevel(1),
    particles: [] as Particle[],
    drops: [] as Drop[],
    floaters: [] as Floater[],
    shake: 0,
    time: 0,
    clearedAt: 0,
    comboPulse: 0,
    sfx: new Sfx(),
    colors: { fg: '#fff', muted: '#999', line: '#2a2a2a' },
  })

  const setPhase = (p: Phase) => { g.current.phase = p; setPhaseState(p) }

  const speed = () => Math.min(470, 300 + 22 * (g.current.level - 1)) * (g.current.time < g.current.slowUntil ? 0.7 : 1)

  const serve = () => {
    const s = g.current
    s.balls = [{ x: s.paddleX, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0, trail: [] }]
    s.combo = 0
    setPhase('ready')
  }

  const launch = () => {
    const s = g.current
    if (s.phase === 'paused') { setPhase('playing'); return }
    if (s.phase !== 'ready') return
    const angle = (Math.random() * 0.6 - 0.3)
    const v = speed()
    for (const b of s.balls) { b.vx = v * Math.sin(angle); b.vy = -v * Math.cos(angle) }
    s.sfx.tone(520, 0.06, 'triangle', 0.08)
    setPhase('playing')
  }

  const newGame = () => {
    const s = g.current
    Object.assign(s, { level: 1, score: 0, lives: 3, paddleW: PADDLE_W, wideUntil: 0, slowUntil: 0, bricks: buildLevel(1), particles: [], drops: [], floaters: [] })
    serve()
  }

  const burst = (x: number, y: number, color: string, n: number, force = 160) => {
    const s = g.current
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const v = force * (0.3 + Math.random())
      const life = 0.4 + Math.random() * 0.5
      s.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life, max: life, color, size: 2 + Math.random() * 3 })
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    const ctx = canvas.getContext('2d')!
    const s = g.current
    let scale = 1
    let raf = 0
    let last = performance.now()

    const readColors = () => {
      const css = getComputedStyle(document.documentElement)
      s.colors = { fg: css.getPropertyValue('--text').trim() || '#fff', muted: css.getPropertyValue('--muted').trim() || '#999', line: css.getPropertyValue('--border').trim() || '#2a2a2a' }
    }
    readColors()

    const resize = () => {
      // Fit the playfield's aspect ratio inside the available width and ~64% of the viewport height.
      const maxW = wrap.clientWidth
      const maxH = Math.max(320, window.innerHeight * 0.64)
      const cssW = Math.min(maxW, (maxH * W) / H)
      const cssH = (cssW * H) / W
      const dpr = Math.min(3, window.devicePixelRatio || 1)
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
      canvas.width = Math.round(cssW * dpr)
      canvas.height = Math.round(cssH * dpr)
      scale = (cssW / W) * dpr
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const hitBrick = (ball: Ball) => {
      for (let i = 0; i < s.bricks.length; i++) {
        const b = s.bricks[i]
        const cx = Math.max(b.x, Math.min(ball.x, b.x + BRICK_W))
        const cy = Math.max(b.y, Math.min(ball.y, b.y + BRICK_H))
        const dx = ball.x - cx
        const dy = ball.y - cy
        if (dx * dx + dy * dy > BALL_R * BALL_R) continue
        // Bounce off the side the ball came from.
        if (Math.abs(dx) > Math.abs(dy)) { ball.vx = Math.sign(dx || -ball.vx) * Math.abs(ball.vx); ball.x = cx + Math.sign(dx || -ball.vx) * BALL_R }
        else { ball.vy = Math.sign(dy || -ball.vy) * Math.abs(ball.vy); ball.y = cy + Math.sign(dy || -ball.vy) * BALL_R }
        b.hp--
        b.flash = 0.12
        if (b.hp > 0) {
          s.sfx.tone(180, 0.05, 'square', 0.05)
          burst(cx, cy, b.color, 4, 80)
          return
        }
        s.bricks.splice(i, 1)
        s.combo++
        const points = 10 * s.level * Math.min(s.combo, 20)
        s.score += points
        s.comboPulse = 1
        s.shake = Math.min(6, 2 + s.combo * 0.4)
        burst(b.x + BRICK_W / 2, b.y + BRICK_H / 2, b.color, 14)
        s.floaters.push({ x: b.x + BRICK_W / 2, y: b.y, text: `+${points}`, life: 0.8, color: b.color })
        s.sfx.tone(440 * Math.pow(2, Math.min(s.combo, 24) / 12), 0.09, 'square', 0.06)
        if ('vibrate' in navigator) navigator.vibrate?.(8)
        if (Math.random() < 0.13) {
          const kinds: PowerKind[] = ['wide', 'multi', 'slow']
          s.drops.push({ x: b.x + BRICK_W / 2, y: b.y + BRICK_H / 2, kind: kinds[Math.floor(Math.random() * kinds.length)] })
        }
        if (s.bricks.length === 0) {
          s.score += 100 * s.level
          s.floaters.push({ x: W / 2, y: H / 2, text: `LEVEL ${s.level} CLEAR! +${100 * s.level}`, life: 1.4, color: '#4CAF50' })
          for (let k = 0; k < 6; k++) burst(40 + Math.random() * (W - 80), 120 + Math.random() * 200, ROW_COLORS[k % ROW_COLORS.length], 18, 220)
          ;[523, 659, 784, 1047].forEach((f, k) => s.sfx.tone(f, 0.12, 'triangle', 0.08, k * 0.09))
          s.clearedAt = s.time
          s.balls = []
          s.drops = []
          setPhase('cleared')
        }
        return
      }
    }

    const step = (dt: number) => {
      s.time += dt
      s.paddleW += ((s.time < s.wideUntil ? 116 : PADDLE_W) - s.paddleW) * Math.min(1, dt * 8)
      s.paddleX += (s.targetX - s.paddleX) * Math.min(1, dt * 22)
      s.paddleX = Math.max(s.paddleW / 2, Math.min(W - s.paddleW / 2, s.paddleX))
      s.shake = Math.max(0, s.shake - dt * 30)
      s.comboPulse = Math.max(0, s.comboPulse - dt * 3)

      for (const p of s.particles) { p.life -= dt; p.vy += 420 * dt; p.x += p.vx * dt; p.y += p.vy * dt }
      s.particles = s.particles.filter((p) => p.life > 0)
      for (const f of s.floaters) { f.life -= dt; f.y -= 40 * dt }
      s.floaters = s.floaters.filter((f) => f.life > 0)
      for (const b of s.bricks) b.flash = Math.max(0, b.flash - dt)

      if (s.phase === 'cleared') {
        if (s.time - s.clearedAt > 1.5) {
          s.level++
          s.bricks = buildLevel(s.level)
          serve()
        }
        return
      }
      if (s.phase === 'ready') {
        for (const b of s.balls) { b.x = s.paddleX; b.y = PADDLE_Y - BALL_R - 1 }
        return
      }
      if (s.phase !== 'playing') return

      // Power-ups fall and are caught by the paddle.
      for (const d of s.drops) d.y += 130 * dt
      s.drops = s.drops.filter((d) => {
        const caught = d.y + 9 >= PADDLE_Y && d.y - 9 <= PADDLE_Y + PADDLE_H && Math.abs(d.x - s.paddleX) <= s.paddleW / 2 + 12
        if (caught) {
          if (d.kind === 'wide') s.wideUntil = s.time + 10
          if (d.kind === 'slow') {
            s.slowUntil = s.time + 8
            for (const b of s.balls) { b.vx *= 0.7; b.vy *= 0.7 }
          }
          if (d.kind === 'multi') {
            const extra: Ball[] = []
            for (const b of s.balls.slice(0, 3)) for (const a of [-0.35, 0.35]) {
              extra.push({ x: b.x, y: b.y, vx: b.vx * Math.cos(a) - b.vy * Math.sin(a), vy: b.vx * Math.sin(a) + b.vy * Math.cos(a), trail: [] })
            }
            s.balls.push(...extra)
          }
          s.floaters.push({ x: d.x, y: PADDLE_Y - 20, text: d.kind === 'wide' ? 'WIDE!' : d.kind === 'multi' ? 'MULTIBALL!' : 'SLOW-MO', life: 1, color: POWER_COLOR[d.kind] })
          ;[660, 880, 1320].forEach((f, k) => s.sfx.tone(f, 0.07, 'triangle', 0.07, k * 0.05))
        }
        return !caught && d.y < H + 20
      })

      const v = speed()
      for (const ball of s.balls) {
        // Keep the ball at the current speed (level and slow-mo changes apply smoothly).
        const cur = Math.hypot(ball.vx, ball.vy) || 1
        ball.vx *= 1 + (v / cur - 1) * Math.min(1, dt * 4)
        ball.vy *= 1 + (v / cur - 1) * Math.min(1, dt * 4)
        // Never let the ball get stuck bouncing almost horizontally.
        if (Math.abs(ball.vy) < v * 0.25) ball.vy = Math.sign(ball.vy || -1) * v * 0.25

        const dist = Math.hypot(ball.vx, ball.vy) * dt
        const steps = Math.max(1, Math.ceil(dist / 4))
        for (let k = 0; k < steps; k++) {
          ball.x += (ball.vx * dt) / steps
          ball.y += (ball.vy * dt) / steps
          if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx); s.sfx.tone(300, 0.03, 'triangle', 0.03) }
          if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx); s.sfx.tone(300, 0.03, 'triangle', 0.03) }
          if (ball.y < BALL_R + 36) { ball.y = BALL_R + 36; ball.vy = Math.abs(ball.vy); s.sfx.tone(300, 0.03, 'triangle', 0.03) }
          if (ball.vy > 0 && ball.y + BALL_R >= PADDLE_Y && ball.y - BALL_R <= PADDLE_Y + PADDLE_H && Math.abs(ball.x - s.paddleX) <= s.paddleW / 2 + BALL_R) {
            // Where it lands on the paddle sets the angle (edges send it wide).
            const offset = Math.max(-1, Math.min(1, (ball.x - s.paddleX) / (s.paddleW / 2)))
            const angle = offset * (Math.PI / 3)
            const sp = Math.hypot(ball.vx, ball.vy)
            ball.vx = sp * Math.sin(angle)
            ball.vy = -sp * Math.cos(angle)
            ball.y = PADDLE_Y - BALL_R
            s.combo = 0
            s.sfx.tone(260, 0.06, 'triangle', 0.07)
          }
          hitBrick(ball)
          if (s.phase !== 'playing') break
        }
        ball.trail.push({ x: ball.x, y: ball.y })
        if (ball.trail.length > 7) ball.trail.shift()
      }
      if (s.phase !== 'playing') return

      const before = s.balls.length
      s.balls = s.balls.filter((b) => b.y - BALL_R < H)
      if (before && !s.balls.length) {
        s.lives--
        s.shake = 8
        s.sfx.tone(160, 0.25, 'sawtooth', 0.06)
        s.sfx.tone(110, 0.3, 'sawtooth', 0.06, 0.12)
        s.drops = []
        s.wideUntil = 0
        s.slowUntil = 0
        if (s.lives <= 0) {
          const newBest = s.score > s.best
          if (newBest) { s.best = s.score; write(BEST_KEY, String(s.score)) }
          setFinal({ score: s.score, best: s.best, level: s.level, newBest })
          setPhase('over')
        } else serve()
      }
    }

    const draw = () => {
      const { fg, muted: mutedColor, line } = s.colors
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      ctx.clearRect(0, 0, W, H)
      ctx.save()
      if (s.shake > 0) ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake)

      // HUD
      ctx.fillStyle = fg
      ctx.font = '700 18px -apple-system, system-ui, sans-serif'
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.fillText(String(s.score), 12, 20)
      ctx.textAlign = 'center'
      ctx.fillStyle = mutedColor
      ctx.font = '600 12px -apple-system, system-ui, sans-serif'
      ctx.fillText(`LEVEL ${s.level}`, W / 2, 20)
      ctx.textAlign = 'right'
      ctx.fillStyle = '#FF6B6B'
      ctx.font = '16px -apple-system, system-ui, sans-serif'
      ctx.fillText('♥'.repeat(Math.max(0, s.lives)), W - 12, 20)
      ctx.fillStyle = line
      ctx.fillRect(0, 36, W, 1)

      if (s.combo >= 3) {
        ctx.save()
        ctx.globalAlpha = 0.9
        ctx.translate(W / 2, H / 2 + 60)
        ctx.scale(1 + s.comboPulse * 0.25, 1 + s.comboPulse * 0.25)
        ctx.textAlign = 'center'
        ctx.fillStyle = ROW_COLORS[s.combo % ROW_COLORS.length]
        ctx.font = '800 28px -apple-system, system-ui, sans-serif'
        ctx.fillText(`${s.combo}× COMBO`, 0, 0)
        ctx.restore()
      }

      for (const b of s.bricks) {
        ctx.globalAlpha = b.max > 1 ? 0.45 + 0.55 * (b.hp / b.max) : 1
        ctx.fillStyle = b.flash > 0 ? '#ffffff' : b.color
        roundRect(ctx, b.x, b.y, BRICK_W, BRICK_H, 4)
        ctx.fill()
        if (b.max > 1) {
          ctx.globalAlpha = 1
          ctx.fillStyle = 'rgba(0,0,0,0.35)'
          ctx.font = '700 10px -apple-system, system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(String(b.hp), b.x + BRICK_W / 2, b.y + BRICK_H / 2 + 1)
        }
      }
      ctx.globalAlpha = 1

      for (const d of s.drops) {
        ctx.fillStyle = POWER_COLOR[d.kind]
        roundRect(ctx, d.x - 16, d.y - 9, 32, 18, 9)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.font = '700 11px -apple-system, system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(POWER_LABEL[d.kind], d.x, d.y + 1)
      }

      // Paddle
      ctx.fillStyle = s.time < s.wideUntil ? '#4ECDC4' : fg
      roundRect(ctx, s.paddleX - s.paddleW / 2, PADDLE_Y, s.paddleW, PADDLE_H, 6)
      ctx.fill()

      for (const ball of s.balls) {
        ball.trail.forEach((t, i) => {
          ctx.globalAlpha = (i / ball.trail.length) * 0.35
          ctx.fillStyle = '#FF6B6B'
          ctx.beginPath()
          ctx.arc(t.x, t.y, BALL_R * (i / ball.trail.length), 0, Math.PI * 2)
          ctx.fill()
        })
        ctx.globalAlpha = 1
        ctx.fillStyle = s.time < s.slowUntil ? '#6C5CE7' : '#FF6B6B'
        ctx.beginPath()
        ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2)
        ctx.fill()
      }

      for (const p of s.particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.max)
        ctx.fillStyle = p.color
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
      }
      for (const f of s.floaters) {
        ctx.globalAlpha = Math.min(1, f.life * 2)
        ctx.fillStyle = f.color
        ctx.font = `800 ${f.text.length > 8 ? 20 : 14}px -apple-system, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(f.text, f.x, f.y)
      }
      ctx.globalAlpha = 1

      if (s.phase === 'ready') {
        ctx.fillStyle = mutedColor
        ctx.font = '600 14px -apple-system, system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('Drag to move · tap to launch', W / 2, PADDLE_Y - 60)
      }
      ctx.restore()
    }

    const frame = (t: number) => {
      const dt = Math.min(0.033, (t - last) / 1000)
      last = t
      step(dt)
      draw()
      raf = requestAnimationFrame(frame)
    }
    serve()
    raf = requestAnimationFrame(frame)

    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && s.phase === 'playing') setPhase('paused')
      last = performance.now()
      readColors()
    }
    document.addEventListener('visibilitychange', onVisibility)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') s.targetX -= 40
      else if (e.key === 'ArrowRight') s.targetX += 40
      else if (e.key === ' ') { s.sfx.unlock(); if (s.phase === 'over') newGame(); else launch() }
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // Pointer: the paddle follows the finger horizontally; a tap (little movement) launches.
  const down = useRef<{ x: number; moved: number } | null>(null)
  const toLogicalX = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return ((e.clientX - rect.left) / rect.width) * W
  }
  const onPointerDown = (e: React.PointerEvent) => {
    g.current.sfx.unlock()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    down.current = { x: e.clientX, moved: 0 }
    g.current.targetX = toLogicalX(e)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' || down.current) g.current.targetX = toLogicalX(e)
    if (down.current) down.current.moved = Math.max(down.current.moved, Math.abs(e.clientX - down.current.x))
  }
  const onPointerUp = () => {
    if (down.current && down.current.moved < 12) launch()
    down.current = null
  }

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    g.current.sfx.muted = next
    write(MUTE_KEY, next ? '1' : '0')
  }

  return (
    <div ref={wrapRef} className="relative flex w-full flex-col items-center">
      <div className="relative overflow-hidden rounded-[20px] bg-card">
        <canvas
          ref={canvasRef}
          className="block touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { down.current = null }}
          aria-label="Brick breaker game. Drag to move the paddle, tap to launch the ball."
        />
        {(phase === 'over' || phase === 'paused') && (
          <div className="fade-in absolute inset-0 flex flex-col items-center justify-center bg-black/70 p-6 text-center text-white">
            {phase === 'paused' ? (
              <>
                <div className="text-2xl font-bold">Paused</div>
                <button className="press mt-5 rounded-2xl bg-accent px-8 py-3 font-semibold" onClick={launch}>Resume</button>
              </>
            ) : (
              <>
                <div className="text-sm font-semibold tracking-widest text-white/70">GAME OVER</div>
                <div className="tabular mt-2 text-5xl font-bold">{final.score}</div>
                <div className="mt-1 text-sm text-white/70">{final.newBest ? '🏆 New best!' : `Best ${final.best}`} · reached level {final.level}</div>
                <button className="press mt-6 rounded-2xl bg-accent px-8 py-3 font-semibold" onClick={newGame}>Play again</button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="mt-2 flex w-full items-center justify-between px-1 text-xs text-muted">
        <span>Best {Math.max(final.best, g.current.best)} · power-ups: ↔ wide, ×3 multiball, 🐢 slow-mo</span>
        <button className="press -mr-1 p-1 text-base" onClick={toggleMute} aria-label={muted ? 'Sound on' : 'Mute'}>{muted ? '🔇' : '🔊'}</button>
      </div>
    </div>
  )
}
