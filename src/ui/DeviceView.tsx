import { iconFrame, type Icon } from '../catalog/catalog';
import { COLORS, MISSING_H, MISSING_W, tagLayout } from '../geometry/scene';
import { deviceBounds, deviceTransform } from '../geometry/transform';
import type { Device } from '../model/types';

interface Props {
  device: Device;
  icon: Icon | undefined;
  body: string | undefined;
  tag: { name: string; facts: string } | null;
  dim: boolean;
  selected: boolean;
}

export function DeviceView({ device, icon, body, tag, dim, selected }: Props) {
  const b = icon ? deviceBounds(device, icon) : { x: device.x, y: device.y, w: MISSING_W, h: MISSING_H };
  const t = tag && tagLayout(b, device.tagSide, tag);
  return (
    <g className={dim ? 'device dim' : 'device'} data-device={device.id}>
      {icon ? (
        <g transform={deviceTransform(device, icon)}>
          {(() => {
            const [vx, vy, vw, vh] = iconFrame(icon);
            return (
              <>
                <rect x={vx} y={vy} width={vw} height={vh} fill="transparent" />
                {body ? (
                  <svg
                    x={vx} y={vy} width={vw} height={vh} viewBox={`${vx} ${vy} ${vw} ${vh}`} overflow="visible"
                    dangerouslySetInnerHTML={{ __html: body }}
                  />
                ) : (
                  <rect x={vx} y={vy} width={vw} height={vh} rx={2} fill={COLORS.missing} />
                )}
              </>
            );
          })()}
        </g>
      ) : (
        <>
          <rect x={device.x} y={device.y} width={MISSING_W} height={MISSING_H} rx={2} fill={COLORS.missing} stroke={COLORS.muted} strokeWidth={0.4} />
          <text x={device.x + MISSING_W / 2} y={device.y + MISSING_H / 2} fontSize={3} textAnchor="middle" fill={COLORS.muted}>
            {device.slug}
          </text>
        </>
      )}
      {tag && t && (
        <text x={t.x} y={t.nameY} fontSize={3.6} fontWeight="bold" textAnchor={t.anchor} fill={COLORS.ink} fontFamily="Helvetica, Arial, sans-serif">
          {tag.name}
        </text>
      )}
      {tag?.facts && t && (
        <text x={t.x} y={t.factsY} fontSize={3} textAnchor={t.anchor} fill={COLORS.muted} fontFamily="Helvetica, Arial, sans-serif">
          {tag.facts}
        </text>
      )}
      {selected && (
        <rect
          x={b.x - 2} y={b.y - 2} width={b.w + 4} height={b.h + 4} rx={2} fill="none" stroke="#0969da"
          strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" pointerEvents="none"
        />
      )}
    </g>
  );
}
