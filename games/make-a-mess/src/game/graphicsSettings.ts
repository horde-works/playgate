import {
  performanceGovernor,
  type PerformanceQuality,
  type RuntimePerformanceSnapshot,
} from "./performanceGovernor.ts";

/**
 * Настройки графики игрока. «Автоматически» — качеством владеет губернатор
 * (авторский максимум, спуск по нагрузке, обратимый подъём). Ручной режим
 * замораживает оси на выбранных значениях; сенсоры продолжают мерить, HUD
 * остаётся честным. Выключение автомата ПРЕДЗАПОЛНЯЕТСЯ тем, что автомат
 * выбрал к этому моменту, — игрок стартует от рабочей точки, а не от нуля.
 */
export interface GraphicsSettings {
  readonly auto: boolean;
  /** Индекс ступени RENDER_SCALE_LADDER: 0 — полное разрешение бюджета. */
  readonly renderScaleLevel: number;
  readonly gpuQuality: PerformanceQuality;
  readonly cpuQuality: PerformanceQuality;
  readonly physicsQuality: PerformanceQuality;
}

export const GRAPHICS_SETTINGS_STORAGE_KEY = "make-a-mess:graphics-settings";

export const DEFAULT_GRAPHICS_SETTINGS: GraphicsSettings = {
  auto: true,
  renderScaleLevel: 0,
  gpuQuality: 2,
  cpuQuality: 2,
  physicsQuality: 2,
};

function clampQuality(value: unknown): PerformanceQuality {
  return value === 0 || value === 1 || value === 2 ? value : 2;
}

function clampLevel(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(3, Math.max(0, Math.round(value)))
    : 0;
}

/** Разбор сохранённого; любой мусор молча возвращает дефолт. */
export function parseGraphicsSettings(raw: string | null): GraphicsSettings {
  if (!raw) return DEFAULT_GRAPHICS_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<GraphicsSettings>;
    return {
      auto: parsed.auto !== false,
      renderScaleLevel: clampLevel(parsed.renderScaleLevel),
      gpuQuality: clampQuality(parsed.gpuQuality),
      cpuQuality: clampQuality(parsed.cpuQuality),
      physicsQuality: clampQuality(parsed.physicsQuality),
    };
  } catch {
    return DEFAULT_GRAPHICS_SETTINGS;
  }
}

export function loadGraphicsSettings(): GraphicsSettings {
  if (typeof window === "undefined") return DEFAULT_GRAPHICS_SETTINGS;
  try {
    return parseGraphicsSettings(
      window.localStorage.getItem(GRAPHICS_SETTINGS_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_GRAPHICS_SETTINGS;
  }
}

export function saveGraphicsSettings(settings: GraphicsSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      GRAPHICS_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings),
    );
  } catch {
    // Приватный режим/квота: настройки живут до перезагрузки.
  }
}

/** Оси губернатора следуют настройкам; разрешение применяет лестница по пропу. */
export function applyGraphicsSettings(settings: GraphicsSettings): void {
  performanceGovernor.setQualityOverride(
    settings.auto
      ? null
      : {
          gpuQuality: settings.gpuQuality,
          cpuQuality: settings.cpuQuality,
          physicsQuality: settings.physicsQuality,
        },
  );
}

/**
 * Ручной режим, предзаполненный текущим выбором автомата, — закон панели:
 * «выключил автоматику — увидел то, что она выбрала, и крутишь от него».
 */
export function manualSettingsFromSnapshot(
  snapshot: RuntimePerformanceSnapshot,
): GraphicsSettings {
  return {
    auto: false,
    renderScaleLevel: clampLevel(snapshot.renderScaleLevel),
    gpuQuality: snapshot.gpuQuality,
    cpuQuality: snapshot.cpuQuality,
    physicsQuality: snapshot.physicsQuality,
  };
}
