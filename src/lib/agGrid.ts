// AG Grid Community: реєстрація модулів, українська локаль, тема за щільністю.
import { AG_GRID_LOCALE_UA } from '@ag-grid-community/locale';
import { AllCommunityModule, ModuleRegistry, themeQuartz, type Theme } from 'ag-grid-community';
import { BRAND_COLOR, FONT_FAMILY, GRID_HEADER_HEIGHT, GRID_ROW_HEIGHT, SEMANTIC_COLORS, type Density } from '@/theme';

ModuleRegistry.registerModules([AllCommunityModule]);

export const GRID_LOCALE: Record<string, string> = AG_GRID_LOCALE_UA;

const themes = new Map<Density, Theme>();

export function gridTheme(density: Density): Theme {
  let theme = themes.get(density);
  if (!theme) {
    const compact = density === 'compact';
    theme = themeQuartz.withParams({
      accentColor: BRAND_COLOR,
      fontFamily: FONT_FAMILY,
      fontSize: compact ? 13 : 14,
      headerFontSize: compact ? 12 : 13,
      headerFontWeight: 600,
      headerBackgroundColor: '#F7F9FC',
      rowHeight: GRID_ROW_HEIGHT[density],
      headerHeight: GRID_HEADER_HEIGHT[density],
      spacing: compact ? 5 : 7,
      borderColor: SEMANTIC_COLORS.border,
      wrapperBorderRadius: 6,
      browserColorScheme: 'light',
    });
    themes.set(density, theme);
  }
  return theme;
}
