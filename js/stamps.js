// Built-in stamp designs.
//
// Every stamp is drawn in black inside a 100 x 100 box. The app later
// re-colors the black "ink" with whatever color is selected, just like a
// real rubber stamp.
//
//   d.fill(p => ...)        adds ink
//   d.cut(p => ...)         removes ink (eyes, holes, details)
//   d.line(p => ..., w)     adds a line of ink, w units thick
//   d.cutLine(p => ..., w)  removes a line of ink
//
// Inside those, p has helpers: circle, ellipse, poly, rect, rrect, svg, path.
// Each helper call is its own piece, so overlapping pieces always merge.

export const STAMP_RES = 512; // stamps are rendered at 512 x 512 pixels

const TAU = Math.PI * 2;
const { PI, cos, sin } = Math;

function starPts(cx, cy, R, r, n, start = -PI / 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 ? r : R;
    const a = start + (i * PI) / n;
    pts.push([cx + rad * cos(a), cy + rad * sin(a)]);
  }
  return pts;
}

function pieces(build) {
  const list = [];
  const add = (fn) => { const q = new Path2D(); fn(q); list.push(q); };
  const p = {
    circle: (x, y, r) => add((q) => q.arc(x, y, r, 0, TAU)),
    ellipse: (x, y, rx, ry, rot = 0) => add((q) => q.ellipse(x, y, rx, ry, rot, 0, TAU)),
    poly: (pts) => add((q) => {
      q.moveTo(...pts[0]);
      for (const pt of pts.slice(1)) q.lineTo(...pt);
      q.closePath();
    }),
    rect: (x, y, w, h) => add((q) => q.rect(x, y, w, h)),
    rrect: (x, y, w, h, r) => add((q) => {
      r = Math.min(r, w / 2, h / 2);
      q.moveTo(x + r, y);
      q.arcTo(x + w, y, x + w, y + h, r);
      q.arcTo(x + w, y + h, x, y + h, r);
      q.arcTo(x, y + h, x, y, r);
      q.arcTo(x, y, x + w, y, r);
      q.closePath();
    }),
    svg: (d) => list.push(new Path2D(d)),
    path: (fn) => add(fn),
  };
  build(p);
  return list;
}

function painter(ctx) {
  const run = (op, build, width) => {
    ctx.globalCompositeOperation = op;
    for (const piece of pieces(build)) {
      if (width) { ctx.lineWidth = width; ctx.stroke(piece); } else ctx.fill(piece);
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  return {
    fill: (b) => run('source-over', b),
    cut: (b) => run('destination-out', b),
    line: (b, w) => run('source-over', b, w),
    cutLine: (b, w) => run('destination-out', b, w),
  };
}

export const BUILTIN_STAMPS = [
  {
    id: 'star', name: 'Star',
    draw(d) { d.fill((p) => p.poly(starPts(50, 54, 47, 20, 5))); },
  },
  {
    id: 'heart', name: 'Heart',
    draw(d) {
      d.fill((p) => p.svg('M50 90 C20 68 4 50 4 31 C4 15 16 6 29 6 C39 6 46 12 50 20 C54 12 61 6 71 6 C84 6 96 15 96 31 C96 50 80 68 50 90 Z'));
    },
  },
  {
    id: 'flower', name: 'Flower',
    draw(d) {
      d.fill((p) => {
        for (let i = 0; i < 6; i++) {
          const a = (i * TAU) / 6 - PI / 2;
          p.circle(50 + 28 * cos(a), 50 + 28 * sin(a), 18);
        }
        p.circle(50, 50, 20);
      });
      d.cut((p) => p.circle(50, 50, 14));
      d.fill((p) => p.circle(50, 50, 10));
    },
  },
  {
    id: 'sun', name: 'Sun',
    draw(d) {
      d.fill((p) => {
        p.circle(50, 50, 25);
        for (let i = 0; i < 12; i++) {
          const a = (i * TAU) / 12;
          p.poly([
            [50 + 30 * cos(a - 0.14), 50 + 30 * sin(a - 0.14)],
            [50 + 48 * cos(a), 50 + 48 * sin(a)],
            [50 + 30 * cos(a + 0.14), 50 + 30 * sin(a + 0.14)],
          ]);
        }
      });
      d.cut((p) => { p.circle(41, 45, 3.5); p.circle(59, 45, 3.5); });
      d.cutLine((p) => p.path((q) => { q.moveTo(40, 55); q.quadraticCurveTo(50, 65, 60, 55); }), 3.5);
    },
  },
  {
    id: 'moon', name: 'Moon',
    draw(d) {
      d.fill((p) => p.circle(46, 52, 42));
      d.cut((p) => p.circle(66, 40, 34));
    },
  },
  {
    id: 'cloud', name: 'Cloud',
    draw(d) {
      d.fill((p) => {
        p.circle(30, 60, 18);
        p.circle(50, 46, 24);
        p.circle(72, 56, 19);
        p.rrect(10, 56, 82, 26, 13);
      });
    },
  },
  {
    id: 'rainbow', name: 'Rainbow',
    draw(d) {
      for (const [R, r] of [[46, 38], [34, 26], [22, 14]]) {
        d.fill((p) => p.path((q) => {
          q.moveTo(50 - R, 74);
          q.arc(50, 74, R, PI, 0);
          q.lineTo(50 + r, 74);
          q.arc(50, 74, r, 0, PI, true);
          q.closePath();
        }));
      }
      d.fill((p) => {
        for (const x of [0, 100]) {
          const s = x ? -1 : 1;
          p.circle(x + s * 10, 80, 8);
          p.circle(x + s * 20, 75, 10);
          p.circle(x + s * 30, 81, 7);
        }
      });
    },
  },
  {
    id: 'butterfly', name: 'Butterfly',
    draw(d) {
      d.fill((p) => {
        p.ellipse(31, 37, 19, 23, -0.5);
        p.ellipse(69, 37, 19, 23, 0.5);
        p.ellipse(35, 67, 13, 16, 0.4);
        p.ellipse(65, 67, 13, 16, -0.4);
      });
      d.cut((p) => p.ellipse(50, 52, 7.5, 32));
      d.fill((p) => p.ellipse(50, 52, 4.5, 26));
      d.line((p) => p.path((q) => {
        q.moveTo(48, 29); q.quadraticCurveTo(44, 14, 35, 10);
        q.moveTo(52, 29); q.quadraticCurveTo(56, 14, 65, 10);
      }), 3);
      d.fill((p) => { p.circle(35, 10, 4); p.circle(65, 10, 4); });
      d.cut((p) => { p.circle(28, 35, 6); p.circle(72, 35, 6); p.circle(35, 69, 4); p.circle(65, 69, 4); });
    },
  },
  {
    id: 'cat', name: 'Cat',
    draw(d) {
      d.fill((p) => {
        p.circle(50, 57, 32);
        p.poly([[21, 46], [23, 10], [47, 30]]);
        p.poly([[79, 46], [77, 10], [53, 30]]);
      });
      d.cut((p) => {
        p.ellipse(38, 53, 4.5, 7);
        p.ellipse(62, 53, 4.5, 7);
        p.poly([[45, 64], [55, 64], [50, 70]]);
      });
      d.cutLine((p) => p.path((q) => {
        q.moveTo(50, 70); q.quadraticCurveTo(46, 77, 40, 74);
        q.moveTo(50, 70); q.quadraticCurveTo(54, 77, 60, 74);
        q.moveTo(33, 65); q.lineTo(21, 62);
        q.moveTo(33, 70); q.lineTo(21, 72);
        q.moveTo(67, 65); q.lineTo(79, 62);
        q.moveTo(67, 70); q.lineTo(79, 72);
      }), 2.5);
    },
  },
  {
    id: 'fish', name: 'Fish',
    draw(d) {
      d.fill((p) => {
        p.ellipse(44, 52, 34, 24);
        p.poly([[70, 52], [97, 28], [90, 52], [97, 76]]);
        p.poly([[34, 31], [52, 16], [60, 32]]);
      });
      d.cut((p) => p.circle(25, 46, 4.5));
      d.cutLine((p) => p.path((q) => { q.moveTo(39, 38); q.quadraticCurveTo(47, 52, 39, 66); }), 3);
    },
  },
  {
    id: 'tree', name: 'Tree',
    draw(d) {
      d.fill((p) => {
        p.rrect(42, 56, 16, 38, 3);
        p.circle(50, 28, 22);
        p.circle(29, 46, 18);
        p.circle(71, 46, 18);
        p.circle(50, 50, 20);
      });
      d.cut((p) => { p.circle(38, 32, 3.5); p.circle(63, 40, 3.5); p.circle(30, 52, 3.5); p.circle(54, 58, 3.5); });
    },
  },
  {
    id: 'unicorn', name: 'Unicorn',
    draw(d) {
      d.fill((p) => {
        p.svg('M30 30 C22 33 12 44 8 55 C6 62 9 68 17 68 L34 66 C40 74 43 84 44 96 L86 96 C85 70 78 46 62 28 L62 12 L52 24 C45 24 37 26 30 30 Z');
        p.poly([[28, 31], [40, 26], [19, 3]]);
        p.circle(68, 30, 8);
        p.circle(76, 44, 8);
        p.circle(83, 59, 8);
        p.circle(87, 75, 8);
        p.circle(90, 90, 6);
      });
      d.cutLine((p) => p.path((q) => { q.moveTo(62, 31); q.bezierCurveTo(74, 47, 80, 70, 81, 97); }), 2.5);
      d.cut((p) => { p.circle(34, 44, 3.5); p.ellipse(14, 61, 2, 3); });
      d.cutLine((p) => p.path((q) => {
        q.moveTo(25.5, 21.5); q.lineTo(32.5, 17.5);
        q.moveTo(23, 13); q.lineTo(27, 10.8);
      }), 1.8);
    },
  },
  {
    id: 'crown', name: 'Crown',
    draw(d) {
      d.fill((p) => {
        p.poly([[10, 82], [12, 34], [31, 56], [50, 22], [69, 56], [88, 34], [90, 82]]);
        p.rrect(8, 80, 84, 12, 3);
        p.circle(12, 30, 6);
        p.circle(50, 18, 6);
        p.circle(88, 30, 6);
      });
      d.cut((p) => { p.circle(30, 69, 5); p.circle(50, 65, 6); p.circle(70, 69, 5); });
      d.cutLine((p) => p.path((q) => { q.moveTo(10, 80); q.lineTo(90, 80); }), 2);
    },
  },
  {
    id: 'balloon', name: 'Balloon',
    draw(d) {
      d.fill((p) => {
        p.ellipse(50, 38, 28, 33);
        p.poly([[44, 78], [56, 78], [50, 69]]);
      });
      d.line((p) => p.path((q) => { q.moveTo(50, 78); q.bezierCurveTo(42, 86, 58, 90, 50, 98); }), 2.5);
      d.cut((p) => p.ellipse(39, 26, 5, 10, 0.5));
    },
  },
  {
    id: 'paw', name: 'Paw',
    draw(d) {
      d.fill((p) => {
        p.ellipse(50, 68, 22, 18);
        p.ellipse(22, 44, 9, 11, -0.3);
        p.ellipse(39, 27, 9, 12, -0.1);
        p.ellipse(61, 27, 9, 12, 0.1);
        p.ellipse(78, 44, 9, 11, 0.3);
      });
    },
  },
  {
    id: 'music', name: 'Music',
    draw(d) {
      d.fill((p) => {
        p.ellipse(28, 78, 13, 9, -0.35);
        p.ellipse(72, 70, 13, 9, -0.35);
        p.rect(36, 22, 6, 56);
        p.rect(80, 14, 6, 56);
        p.poly([[36, 22], [86, 14], [86, 28], [36, 36]]);
      });
    },
  },
  {
    id: 'bird', name: 'Bird',
    draw(d) {
      d.fill((p) => {
        p.circle(42, 52, 25);
        p.poly([[58, 48], [95, 34], [88, 54], [95, 70], [58, 64]]);
        p.poly([[20, 45], [5, 52], [20, 58]]);
      });
      d.cut((p) => p.circle(32, 45, 3.5));
      d.cutLine((p) => p.path((q) => { q.moveTo(34, 58); q.quadraticCurveTo(48, 74, 63, 55); }), 3);
      d.line((p) => p.path((q) => {
        q.moveTo(36, 76); q.lineTo(34, 91); q.moveTo(28, 92); q.lineTo(39, 92);
        q.moveTo(48, 76); q.lineTo(50, 91); q.moveTo(45, 92); q.lineTo(56, 92);
      }), 3);
    },
  },
  {
    id: 'mushroom', name: 'Mushroom',
    draw(d) {
      d.fill((p) => {
        p.path((q) => {
          q.moveTo(5, 54);
          q.bezierCurveTo(5, 8, 95, 8, 95, 54);
          q.quadraticCurveTo(50, 62, 5, 54);
          q.closePath();
        });
        p.rrect(34, 52, 32, 42, 10);
      });
      d.cutLine((p) => p.path((q) => { q.moveTo(14, 56.5); q.quadraticCurveTo(50, 63.5, 86, 56.5); }), 3);
      d.cut((p) => { p.circle(28, 38, 6); p.circle(52, 26, 7); p.circle(73, 40, 5.5); p.circle(50, 46, 4); });
    },
  },
  {
    id: 'snowflake', name: 'Snowflake',
    draw(d) {
      d.line((p) => p.path((q) => {
        for (let i = 0; i < 6; i++) {
          const a = (i * TAU) / 6 - PI / 2;
          q.moveTo(50, 50); q.lineTo(50 + 44 * cos(a), 50 + 44 * sin(a));
          for (const [r, len] of [[24, 13], [36, 8]]) {
            const bx = 50 + r * cos(a), by = 50 + r * sin(a);
            q.moveTo(bx, by); q.lineTo(bx + len * cos(a - 0.8), by + len * sin(a - 0.8));
            q.moveTo(bx, by); q.lineTo(bx + len * cos(a + 0.8), by + len * sin(a + 0.8));
          }
        }
      }), 6);
      d.fill((p) => p.circle(50, 50, 9));
    },
  },
  {
    id: 'house', name: 'House',
    draw(d) {
      d.fill((p) => {
        p.rect(20, 46, 60, 46);
        p.poly([[8, 50], [50, 12], [92, 50]]);
        p.rect(66, 18, 11, 24);
      });
      d.cutLine((p) => p.path((q) => { q.moveTo(14, 49); q.lineTo(86, 49); }), 2.5);
      d.cut((p) => {
        p.rrect(43, 66, 14, 30, 6);
        p.rect(26, 57, 12, 12);
        p.rect(62, 57, 12, 12);
      });
    },
  },
  {
    id: 'sparkle', name: 'Sparkle',
    draw(d) {
      d.fill((p) => {
        p.poly(starPts(44, 56, 40, 10, 4));
        p.poly(starPts(82, 18, 16, 4, 4));
        p.poly(starPts(85, 74, 9, 2.5, 4));
      });
    },
  },
  {
    id: 'smiley', name: 'Smiley',
    draw(d) {
      d.fill((p) => p.circle(50, 50, 44));
      d.cut((p) => { p.ellipse(36, 40, 5, 8); p.ellipse(64, 40, 5, 8); });
      d.cutLine((p) => p.path((q) => { q.moveTo(28, 58); q.quadraticCurveTo(50, 82, 72, 58); }), 6);
    },
  },
  {
    id: 'dot', name: 'Dot',
    draw(d) { d.fill((p) => p.circle(50, 50, 44)); },
  },
];

export function renderBuiltin(def, size = STAMP_RES) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.scale(size / 100, size / 100);
  ctx.fillStyle = ctx.strokeStyle = '#000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  def.draw(painter(ctx));
  return c;
}
