/**
 * ЖИРНАЯ НИТЬ ТРАССЫ: патч шейдера `LineMaterial` и упаковка инстансов.
 *
 * `THREE.Line` рисуется через `gl.LINES`, а `linewidth` там игнорирует
 * ДРАЙВЕР: на всяком десктопном GL нить ровно в один пиксель. Отсюда и
 * «маршруты — тонкие нитки», и то, что дальнее не отличалось от ближнего:
 * один пиксель в сорока метрах и в четырёхстах — одни и те же пиксели.
 *
 * `LineSegments2` умеет толщину, но только в двух режимах: постоянной в
 * ЭКРАННЫХ пикселях (снова стирает дальнее от ближнего) или в МИРОВЫХ
 * единицах (даль исчезает совсем). Нужен третий: мировая ширина, зажатая
 * полом и потолком в пикселях. Его и вставляет этот патч, заодно принося
 * дальнее затухание и настоящую альфу по вершине — у `LineMaterial` цвет
 * вершины только RGB, а домножать альфу в RGB значит красить старый след
 * ЧЁРНЫМ по светлому небу вместо того, чтобы его гасить.
 *
 * Модуль чистый: ни three, ни React. Строки-якоря принадлежат three и
 * проверяются тестом — смена версии иначе молча вернёт нить в один пиксель.
 */

export const ROUTE_LINE_VERTEX_ANCHORS = [
  "uniform vec2 resolution;",
  "vec4 clipStart = projectionMatrix * start;",
  "offset *= linewidth;",
] as const;

export const ROUTE_LINE_FRAGMENT_ANCHORS = [
  "uniform float opacity;",
  "float alpha = opacity;",
] as const;

const ROUTE_LINE_VERTEX_HEAD = /* glsl */ `
		uniform vec2 resolution;
		uniform float routeWidthWorld;
		uniform vec2 routeWidthClamp;
		uniform vec3 routeFade;
		attribute float instanceAlphaStart;
		attribute float instanceAlphaEnd;
		varying float vRouteFade;
		varying float vRouteAlpha;
`;

const ROUTE_LINE_VERTEX_WIDTH = /* glsl */ `
			float routeDepth = max( 0.05, - ( ( position.y < 0.5 ) ? start.z : end.z ) );
			float routePixelsPerMetre = projectionMatrix[ 1 ][ 1 ] * resolution.y * 0.5;
			float routeWidthPx = clamp(
				routeWidthWorld * routePixelsPerMetre / routeDepth,
				routeWidthClamp.x,
				routeWidthClamp.y
			);
			vRouteFade = mix(
				1.0,
				routeFade.z,
				clamp( ( routeDepth - routeFade.x ) / max( 1.0, routeFade.y - routeFade.x ), 0.0, 1.0 )
			);
			vRouteAlpha = ( position.y < 0.5 ) ? instanceAlphaStart : instanceAlphaEnd;

			vec4 clipStart = projectionMatrix * start;
`;

const ROUTE_LINE_FRAGMENT_HEAD = /* glsl */ `
		uniform float opacity;
		varying float vRouteFade;
		varying float vRouteAlpha;
`;

export function patchRouteLineVertexShader(source: string): string {
  return source
    .replace(ROUTE_LINE_VERTEX_ANCHORS[0], ROUTE_LINE_VERTEX_HEAD)
    .replace(ROUTE_LINE_VERTEX_ANCHORS[1], ROUTE_LINE_VERTEX_WIDTH)
    .replace(ROUTE_LINE_VERTEX_ANCHORS[2], "offset *= routeWidthPx;");
}

export function patchRouteLineFragmentShader(source: string): string {
  return source
    .replace(ROUTE_LINE_FRAGMENT_ANCHORS[0], ROUTE_LINE_FRAGMENT_HEAD)
    .replace(
      ROUTE_LINE_FRAGMENT_ANCHORS[1],
      "float alpha = opacity * vRouteFade * vRouteAlpha;",
    );
}

export interface RouteInstanceBuffers {
  /** Пары вершин, шаг 6: xyz начала, xyz конца. */
  readonly positions: Float32Array;
  /** Цвета той же раскладки, шаг 6. */
  readonly colors: Float32Array;
  /** Альфа отдельным атрибутом, шаг 2. */
  readonly alphas: Float32Array;
  readonly segments: number;
}

/**
 * Раскладка `RouteLineGeometry` (позиции + RGBA по вершине) в инстансные
 * буферы жирной линии. `strip` — полилиния, иначе уже готовые пары.
 * Пустой вход даёт один вырожденный сегмент с нулевой альфой: атрибуты
 * обязаны существовать на первом кадре, иначе программа рисует в пустоту.
 */
export function routeInstanceBuffers(
  line: { readonly positions: Float32Array; readonly colors: Float32Array },
  strip: boolean,
): RouteInstanceBuffers {
  const vertices = Math.floor(line.positions.length / 3);
  const segments = strip ? Math.max(0, vertices - 1) : Math.floor(vertices / 2);
  const slots = Math.max(1, segments);
  const positions = new Float32Array(slots * 6);
  const colors = new Float32Array(slots * 6);
  const alphas = new Float32Array(slots * 2);
  for (let segment = 0; segment < segments; segment += 1) {
    const from = strip ? segment : segment * 2;
    const to = from + 1;
    positions.set(line.positions.subarray(from * 3, from * 3 + 3), segment * 6);
    positions.set(line.positions.subarray(to * 3, to * 3 + 3), segment * 6 + 3);
    colors.set(line.colors.subarray(from * 4, from * 4 + 3), segment * 6);
    colors.set(line.colors.subarray(to * 4, to * 4 + 3), segment * 6 + 3);
    alphas[segment * 2] = line.colors[from * 4 + 3];
    alphas[segment * 2 + 1] = line.colors[to * 4 + 3];
  }
  return { positions, colors, alphas, segments };
}
