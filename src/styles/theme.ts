/**
 * /src/styles/theme.ts
 * デザイントークン: スマホ縦持ち専用
 * 寸法は全て clamp(下限px, Ndvh/dvw, 上限px) 形式。pt/px 生指定禁止。
 * dvh主軸（縦持ち固定なのでvminより直感的）。dvw補助。
 */

export const colors = {
  // brand
  primary: "#4f46e5",
  primaryLight: "#6366f1",
  primaryDark: "#4338ca",
  primaryShadow: "rgba(79, 70, 229, 0.35)",

  // semantic
  saved: "#10b981",
  savedDark: "#059669",
  edit: "#f59e0b",
  editDark: "#d97706",
  danger: "#ef4444",
  dangerDark: "#dc2626",
  warning: "#f59e0b",

  // surface
  bg: "#f8fafc",
  card: "#ffffff",
  cardLocked: "#f1f5f9",
  border: "#e2e8f0",
  borderStrong: "#cbd5e1",

  // text
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#94a3b8",
  textOnPrimary: "#ffffff",

  // input
  inputBg: "#f8fafc",
  inputBgFocus: "#ffffff",
  inputBorderEmpty: "#fda4af", // pink-300 相当（弱め赤系）

  // overlay
  overlay: "rgba(15, 23, 42, 0.55)",
} as const;

/**
 * clampヘルパー: 縦持ち主軸=dvh
 * fluid(min, prefer, max) → clamp(${min}px, ${prefer}dvh, ${max}px)
 */
export const fluid = (minPx: number, dvh: number, maxPx: number): string =>
  `clamp(${minPx}px, ${dvh}dvh, ${maxPx}px)`;

/** dvw版（横方向のサイズ用） */
export const fluidW = (minPx: number, dvw: number, maxPx: number): string =>
  `clamp(${minPx}px, ${dvw}dvw, ${maxPx}px)`;

/**
 * spacing スケール: 8pt grid を dvh連動に拡張
 * 数字はおおよその下限-上限px、プロポーション dvh
 */
export const space = {
  xxs: fluid(2, 0.4, 4),
  xs: fluid(4, 0.7, 6),
  sm: fluid(6, 1.0, 10),
  md: fluid(8, 1.4, 14),
  lg: fluid(12, 2.0, 20),
  xl: fluid(16, 2.8, 28),
  xxl: fluid(20, 3.6, 36),
} as const;

/** font size スケール */
export const font = {
  xs: fluid(10, 1.5, 12),
  sm: fluid(11, 1.7, 13),
  md: fluid(13, 2.0, 15),
  lg: fluid(15, 2.4, 18),
  xl: fluid(18, 2.9, 22),
  xxl: fluid(22, 3.5, 28),
  display: fluid(26, 4.2, 34),
} as const;

/** radius スケール */
export const radius = {
  sm: fluid(4, 0.8, 6),
  md: fluid(6, 1.2, 10),
  lg: fluid(10, 1.6, 14),
  xl: fluid(14, 2.2, 18),
  pill: "999px",
} as const;

/** shadow スケール（dvh連動の弱影） */
export const shadow = {
  sm: `0 ${fluid(1, 0.2, 2)} ${fluid(3, 0.6, 6)} rgba(15, 23, 42, 0.06)`,
  md: `0 ${fluid(2, 0.4, 4)} ${fluid(8, 1.2, 14)} rgba(15, 23, 42, 0.08)`,
  lg: `0 ${fluid(4, 0.8, 8)} ${fluid(14, 2.0, 24)} rgba(15, 23, 42, 0.12)`,
  primary: `0 ${fluid(3, 0.6, 6)} ${fluid(10, 1.6, 18)} ${colors.primaryShadow}`,
} as const;

/** タップターゲット下限保証 */
export const tapTarget = fluid(40, 6, 56);

export const theme = {
  colors,
  space,
  font,
  radius,
  shadow,
  fluid,
  fluidW,
  tapTarget,
} as const;

export type Theme = typeof theme;
