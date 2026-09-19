import { fmtClock } from '../lib/aelskar.js';

const CX = 50, CY = 50;
const R_OUTER = 46;          // cercle exterieur unique
const TICK_COUNT = 72;       // une graduation toutes les 20 minutes (5 deg)
const HAND_LENGTH = R_OUTER * 0.74;

function pt(angleDeg, r) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

// Graduations calculees une fois : 288 traits fins, les 4 principales (00/06/12/18)
// plus longues et un peu plus epaisses, toutes a l'interieur du contour.
const TICKS = (() => {
  const out = [];
  for (let i = 0; i < TICK_COUNT; i++) {
    const a = (i * 360) / TICK_COUNT;
    const major = i % (TICK_COUNT / 4) === 0;
    const [x1, y1] = pt(a, major ? R_OUTER - 9 : R_OUTER - 5.5);
    const [x2, y2] = pt(a, R_OUTER - 1.2);
    out.push(
      <line
        key={i} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="var(--gilt)" strokeWidth={major ? 1.6 : 0.7} strokeLinecap="butt"
        opacity={major ? 1 : 0.85}
      />
    );
  }
  return out;
})();

const [SUN_X, SUN_Y] = [CX, CY + 22];   // partie inferieure (12 h)
const [MOON_X, MOON_Y] = [CX, CY - 22]; // partie superieure (00 h)

const SUN_RAYS = (() => {
  const rays = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    rays.push(
      <line
        key={i}
        x1={SUN_X + 5.4 * Math.cos(a)} y1={SUN_Y + 5.4 * Math.sin(a)}
        x2={SUN_X + 7.6 * Math.cos(a)} y2={SUN_Y + 7.6 * Math.sin(a)}
        stroke="var(--gilt)" strokeWidth="0.9" strokeLinecap="round"
      />
    );
  }
  return rays;
})();

/** Horloge en jeu : cadran 24 h transparent, 00 h en haut / 06 h a droite /
 * 12 h en bas / 18 h a gauche, lune ivoire fixe en haut, soleil dore fixe en bas,
 * une seule aiguille doree qui fait un tour en 24 h. Pas de transition CSS sur
 * l'aiguille : le passage 23:59 -> 00:00 ne la fait jamais tourner a l'envers. */
export default function WorldClock({ hours }) {
  const h = ((Number(hours) || 0) % 24 + 24) % 24;
  const totalMinutes = Math.floor(h * 60);
  const angle = (totalMinutes / 1440) * 360;
  const [tipX, tipY] = pt(angle, HAND_LENGTH);
  const [lX, lY] = pt(angle - 90, 1.3);
  const [rX, rY] = pt(angle + 90, 1.3);
  const [tailX, tailY] = pt(angle + 180, 2);
  const label = fmtClock(totalMinutes / 60);

  return (
    <div className="worldclock">
      <svg className="worldclock__face" width="72" height="72" viewBox="0 0 100 100" role="img" aria-label={'Heure en jeu : ' + label}>
        {/* Nuit : moitie superieure (18 h -> 06 h) legerement assombrie. */}
        <path d={`M ${CX - R_OUTER + 1},${CY} A ${R_OUTER - 1},${R_OUTER - 1} 0 0,1 ${CX + R_OUTER - 1},${CY} Z`} fill="#000" opacity="0.32" />
        <circle cx={CX} cy={CY} r={R_OUTER} fill="none" stroke="var(--gilt)" strokeWidth="1.1" />
        {TICKS}
        {/* Lune : croissant ivoire, fixe, centre dans la moitie superieure. */}
        <path
          d={`M ${MOON_X},${MOON_Y - 6} A 6,6 0 1,0 ${MOON_X},${MOON_Y + 6} A 7.5,7.5 0 0,1 ${MOON_X},${MOON_Y - 6} Z`}
          fill="var(--fg)" opacity="0.92"
        />
        {/* Soleil : disque simple et huit rayons fins, fixe, moitie inferieure. */}
        {SUN_RAYS}
        <circle cx={SUN_X} cy={SUN_Y} r={3.6} fill="var(--gilt)" />
        {/* Aiguille effilee + pivot, dessinee en dernier pour rester lisible. */}
        <polygon points={`${tailX},${tailY} ${lX},${lY} ${tipX},${tipY} ${rX},${rY}`} fill="var(--gilt)" />
        <circle cx={CX} cy={CY} r={3} fill="var(--gilt)" />
      </svg>
      <span className="worldclock__digital">{label}</span>
    </div>
  );
}
