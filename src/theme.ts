// Дизайн-система (§5): токени antd, семантичні кольори (CSS-змінні), щільність.
import type { ThemeConfig } from 'antd';

export type Density = 'compact' | 'normal';

export const BRAND_COLOR = '#1050B8';

/** Семантичні кольори — єдине джерело; у CSS доступні як змінні --po-* (див. applyThemeCssVars). */
export const SEMANTIC_COLORS = {
  brand: BRAND_COLOR,
  /** Мінімальна ціна: фон і текст/рамка. */
  minBg: '#E8F5E9',
  min: '#1E7B34',
  /** Затверджено: галочка й рамка. */
  approved: BRAND_COLOR,
  /** Виключено: сірий + закреслення. */
  excluded: '#9AA0A6',
  warning: '#FA8C16',
  warningBg: '#FFF7E6',
  error: '#D93025',
  errorBg: '#FDECEA',
  /** Порожня клітинка-плейсхолдер. */
  placeholder: '#B4BAC3',
  pageBg: '#F4F6F9',
  border: '#E3E7ED',
} as const;

export const FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif";

/** Висота рядка сітки AG Grid за щільністю. */
export const GRID_ROW_HEIGHT: Record<Density, number> = { compact: 28, normal: 36 };
export const GRID_HEADER_HEIGHT: Record<Density, number> = { compact: 32, normal: 40 };

export function antdTheme(density: Density): ThemeConfig {
  const compact = density === 'compact';
  return {
    token: {
      colorPrimary: BRAND_COLOR,
      colorInfo: BRAND_COLOR,
      colorSuccess: SEMANTIC_COLORS.min,
      colorWarning: SEMANTIC_COLORS.warning,
      colorError: SEMANTIC_COLORS.error,
      colorBgLayout: SEMANTIC_COLORS.pageBg,
      borderRadius: 6,
      fontFamily: FONT_FAMILY,
      fontSize: compact ? 13 : 14,
      controlHeight: compact ? 28 : 32,
    },
    components: {
      Layout: {
        headerBg: '#FFFFFF',
        siderBg: '#FFFFFF',
        headerHeight: 52,
        headerPadding: '0 16px',
      },
      Menu: { itemHeight: compact ? 34 : 40, itemBorderRadius: 6 },
      Tabs: { horizontalMargin: '0' },
    },
  };
}

/** CSS-змінні теми на :root (використовуються в cellClassRules і стилях). */
export function applyThemeCssVars(density: Density): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const vars: Record<string, string> = {
    '--po-brand': SEMANTIC_COLORS.brand,
    '--po-min-bg': SEMANTIC_COLORS.minBg,
    '--po-min': SEMANTIC_COLORS.min,
    '--po-approved': SEMANTIC_COLORS.approved,
    '--po-excluded': SEMANTIC_COLORS.excluded,
    '--po-warning': SEMANTIC_COLORS.warning,
    '--po-warning-bg': SEMANTIC_COLORS.warningBg,
    '--po-error': SEMANTIC_COLORS.error,
    '--po-error-bg': SEMANTIC_COLORS.errorBg,
    '--po-placeholder': SEMANTIC_COLORS.placeholder,
    '--po-page-bg': SEMANTIC_COLORS.pageBg,
    '--po-border': SEMANTIC_COLORS.border,
    '--po-font': FONT_FAMILY,
    '--po-row-height': `${GRID_ROW_HEIGHT[density]}px`,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.density = density;
}
