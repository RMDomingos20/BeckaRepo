// A small illustrative neighborhood. Opening the app never starts the layout worker.
const points = [[134,111],[61,73],[92,145],[201,64],[232,131],[182,189],[52,165],[288,80],[111,37],[250,192],[37,109]];
const links = [[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,8],[0,10],[1,8],[2,6],[3,7],[4,7],[5,9]];

export function OrbitFigure() {
  return <svg viewBox="0 0 340 224" aria-hidden="true" className="orbit-figure">
    <g fill="none" stroke="var(--border)" strokeWidth=".7" transform="rotate(-17 153 112)">
      {[52,96,145].map(r => <ellipse key={r} cx="153" cy="112" rx={r} ry={r * .63} strokeDasharray="2 5" />)}
    </g>
    <g stroke="var(--borderHi)" strokeWidth="1">{links.map(([a,b]) =>
      <line key={a+'-'+b} x1={points[a][0]} y1={points[a][1]} x2={points[b][0]} y2={points[b][1]} />)}</g>
    {points.slice(1).map(([x,y],i) => <circle key={x} cx={x} cy={y} r={i===2 || i===3 ? 5.5 : 3.5} fill={i%3===0?'#e4ac83':'var(--accent)'} />)}
    <circle cx="134" cy="111" r="17" stroke="var(--accent)" fill="var(--bgCard)"/>
    <path d="m134 102 9 9-9 9-9-9Z" fill="var(--accentHi)"/>
    <circle cx="293" cy="166" r="4" fill="none" stroke="#cfb58e" strokeWidth="1.5"/>
    <g fill="var(--ink)" fontFamily="ui-monospace, monospace" fontSize="10" stroke="var(--bgDeep)" strokeWidth="4" paintOrder="stroke">
      <text x="146" y="100">core.ts</text><text x="198" y="50">app.ts</text><text x="45" y="60">view.ts</text><text x="262" y="184">logo.svg</text>
    </g>
  </svg>;
}
