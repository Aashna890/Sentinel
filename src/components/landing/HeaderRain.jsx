import { useEffect, useRef } from 'react';

// Matrix-style rain of email-forensic tokens — reads like a live packet/header intercept.
const TOKENS = [
  'Received:', 'from:', 'by:', 'SPF=fail', 'DKIM=none', 'DMARC=fail', 'SPF=pass',
  'From:', 'Reply-To:', 'Return-Path:', 'Message-ID:', 'X-Originating-IP:',
  '198.51.100.7', '203.0.113.9', 'BEC', 'FRAUD:94', 'phishing', 'spoof',
  'lookalike', 'relay', 'TOR', 'proxy', 'open-relay', 'impersonation',
  'wire-transfer', 'urgent', 'confirm', 'harvest', '0x4A9F', 'AUTH=fail',
];

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@:./<>-_+=%';

export default function HeaderRain() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w, h, columns, drops, raf;
    const FONT = 13;
    const COL_W = 15;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.ceil(w / COL_W);
      columns = Array.from({ length: n }, (_, i) => ({
        y: Math.random() * -h,
        speed: 0.6 + Math.random() * 1.4,
        // each column either a token stream or a char stream
        mode: Math.random() < 0.35 ? 'token' : 'char',
        token: TOKENS[Math.floor(Math.random() * TOKENS.length)],
        red: Math.random() < 0.18,
        len: 8 + Math.floor(Math.random() * 14),
      }));
    }

    function draw() {
      // trailing fade
      ctx.fillStyle = 'rgba(2, 6, 23, 0.09)';
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${FONT}px ui-monospace, monospace`;
      ctx.textBaseline = 'top';

      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        const x = i * COL_W;
        const head = col.mode === 'token' ? col.token : CHARSET[Math.floor(Math.random() * CHARSET.length)];
        // bright head
        ctx.fillStyle = col.red ? 'rgba(248,113,113,0.95)' : 'rgba(165,243,252,0.95)';
        ctx.fillText(head, x, col.y);
        // trailing glyphs
        for (let k = 1; k < col.len; k++) {
          const ty = col.y - k * FONT;
          if (ty < -FONT) continue;
          const a = (1 - k / col.len) * 0.5;
          ctx.fillStyle = col.red
            ? `rgba(248,113,113,${a})`
            : `rgba(34,211,238,${a})`;
          const g = col.mode === 'token'
            ? (col.token[k % col.token.length] || ':')
            : CHARSET[Math.floor(Math.random() * CHARSET.length)];
          ctx.fillText(g, x, ty);
        }

        col.y += col.speed * FONT * 0.18 * 2.2; // ~ move per frame
        if (col.y > h + col.len * FONT) {
          col.y = -col.len * FONT;
          col.speed = 0.6 + Math.random() * 1.4;
          col.token = TOKENS[Math.floor(Math.random() * TOKENS.length)];
          col.mode = Math.random() < 0.35 ? 'token' : 'char';
          col.red = Math.random() < 0.18;
          col.len = 8 + Math.floor(Math.random() * 14);
        }
      }
      raf = requestAnimationFrame(draw);
    }

    resize();
    if (reduce) {
      draw();
      cancelAnimationFrame(raf);
    } else {
      draw();
      window.addEventListener('resize', resize);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 -z-10 w-full h-full pointer-events-none opacity-[0.22]"
    />
  );
}