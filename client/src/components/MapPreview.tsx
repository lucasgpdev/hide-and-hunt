import { useMemo } from 'react';
import { getMap } from '@hh/shared';

const SOLID_COLORS: Record<string, string> = {
  wall: '#d9d4c8',
  shelf: '#7d8794',
  rack: '#3d5a8c',
  freezer: '#9fd3ff',
  produce: '#7cb342',
  counter: '#a7a29a',
  checkout: '#55606b',
  bench: '#8a6a48',
  lab_desk: '#bfa77f',
  teacher_desk: '#bfa77f',
  chalkboard: '#2f5d46',
  locker: '#3f6fa8',
  pillar: '#bdb7ab',
  bed: '#6d88b5',
  bookshelf: '#6b4a2f',
  stove: '#b9bec5',
  car: '#a63a3a',
  tree: '#3f6b2f',
  hedge: '#3e6a2e',
  pallet: '#b48a5c',
  forklift: '#e0a419',
  fountain: '#6fa8c8',
  elevator: '#4a4f57',
};

/** Prévia do mapa vista de cima, gerada a partir dos dados do mapa. */
export function MapPreview({ mapId, className }: { mapId: string; className?: string }) {
  const map = useMemo(() => getMap(mapId), [mapId]);
  if (!map) return <div className={`map-preview map-preview--empty ${className ?? ''}`}>Em breve</div>;
  const [w, d] = map.size;
  return (
    <svg className={`map-preview ${className ?? ''}`} viewBox={`${-w / 2 - 1} ${-d / 2 - 1} ${w + 2} ${d + 2}`} role="img" aria-label={`Planta do mapa ${map.name}`}>
      <rect x={-w / 2} y={-d / 2} width={w} height={d} fill={map.theme.floor} />
      {map.zones.map((zone) => (
        <rect
          key={zone.name}
          x={zone.rect[0]}
          y={zone.rect[1]}
          width={zone.rect[2] - zone.rect[0]}
          height={zone.rect[3] - zone.rect[1]}
          fill={zone.floorColor}
        />
      ))}
      {map.solids.map((solid, index) => (
        <rect
          key={index}
          x={solid.center[0] - solid.size[0] / 2}
          y={solid.center[2] - solid.size[2] / 2}
          width={solid.size[0]}
          height={solid.size[2]}
          fill={SOLID_COLORS[solid.kind] ?? '#999'}
        />
      ))}
      {map.props.map((prop) => (
        <circle key={prop.id} cx={prop.position[0]} cy={prop.position[2]} r={0.22} fill="#ffb547" opacity={0.8} />
      ))}
    </svg>
  );
}
