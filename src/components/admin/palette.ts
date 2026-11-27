/**
 * Palettes validated with the dataviz validator (lightness band, chroma, CVD separation, contrast):
 *  screen: #78A945 / #CF70C1 on the dark green surface
 *  print:  #4E8A2E / #A23C8C on white
 */
export type ChartTheme = "screen" | "print";

export const chartColors = {
  screen: { primary: "#78A945", secondary: "#CF70C1", grid: "rgba(255,255,255,0.07)", axis: "#71806C", text: "#A6B399", strong: "#EAF2DD", surface: "#13271B", track: "rgba(255,255,255,0.05)" },
  print: { primary: "#4E8A2E", secondary: "#A23C8C", grid: "#E5E7E1", axis: "#6B7466", text: "#4A5446", strong: "#1C2418", surface: "#FFFFFF", track: "#EEF1EA" },
};
