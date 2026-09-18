import { fmtClock } from '../lib/aelskar.js';

const CX = 50, CY = 50;

function pt(angleDeg, r) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

/** Horloge en jeu : cadran 24h, soleil fixe à midi (bas) / lune fixe à minuit (haut), aiguille qui pointe l'heure. */
export default function WorldClock({ hours }) {
  const h = ((Number(hours) || 0) % 24 + 24) % 24;
  const angle = (h / 24) * 360;
  const [tipX, tipY] = pt(angle, 34);
  const [tailX, tailY] = pt(angle + 180, 8);

  const [sunX, sunY] = pt(180, 34); // midi, en bas
  const [moonX, moonY] = pt(0, 34); // minuit, en haut

  const ticks = [];
  for (let i = 0; i < 24; i++) {
    const a = i * 15;
    const major = i % 6 === 0;
    const [x1, y1] = pt(a, major ? 37 : 39);
    const [x2, y2] = pt(a, 42);
    ticks.push(
      <line
        key={i} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={major ? 'var(--gilt)' : 'var(--rule)'} strokeWidth={major ? 1.3 : 0.6}
      />
    );
  }

  const sunRays = [];
  for (let i = 0; i < 8; i++) {
    const a = i * 45;
    const [rx1, ry1] = [sunX + 5.5 * Math.cos((a * Math.PI) / 180), sunY + 5.5 * Math.sin((a * Math.PI) / 180)];
    const [rx2, ry2] = [sunX + 8 * Math.cos((a * Math.PI) / 180), sunY + 8 * Math.sin((a * Math.PI) / 180)];
    sunRays.push(<line key={i} x1={rx1} y1={ry1} x2={rx2} y2={ry2} stroke="var(--gilt)" strokeWidth="1" />);
  }

  return (
    <div className="worldclock">
      <span className="worldclock__digital">{fmtClock(h)}</span>
      <svg className="worldclock__face" width="72" height="72" viewBox="0 0 100 100" role="img" aria-label={'Heure en jeu : ' + fmtClock(h)}>
        <circle cx={CX} cy={CY} r={47} fill="none" stroke="var(--blood)" strokeWidth="1.5" />
        <circle cx={CX} cy={CY} r={44} fill="var(--bg)" stroke="var(--gilt)" strokeWidth="2" />
        {ticks}
        {sunRays}
        <circle cx={sunX} cy={sunY} r={4} fill="var(--gilt)" />
        <circle cx={moonX} cy={moonY} r={4.2} fill="var(--fg)" />
        <circle cx={moonX + 1.6} cy={moonY - 1.2} r={3.6} fill="var(--bg)" />
        <line x1={tailX} y1={tailY} x2={tipX} y2={tipY} stroke="var(--blood)" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx={CX} cy={CY} r={2.4} fill="var(--blood)" />
      </svg>
    </div>
  );
}
