export type ProvinceCode = "AB" | "BC" | "SK" | "MB";

export const ECO_FEE_CONFIG: Record<ProvinceCode, {
  enabled: boolean;
  label: string;
  tagFeeByFlag: Record<string, number>;
}> = {
  AB: {
    enabled: true,
    label: "AB Environmental Fee",
    tagFeeByFlag: {
      hasEcoAbComputers: 0.45,
      hasEcoAbLaptops: 0.30,
      hasEcoAbPrinters: 1.65,
      hasEcoAbSmallAppliances: 0.40,
      hasEcoAbAv: 0.55,
      hasEcoAbTools: 0.65,
      hasEcoAbMonitorSmall: 1.30,
      hasEcoAbMonitorLarge: 2.75,
    },
  },

  BC: {
    enabled: false,
    label: "BC Environmental Fee",
    tagFeeByFlag: {
      // future BC flags here...
    },
  },

  SK: { enabled: false, label: "SK Environmental Fee", tagFeeByFlag: {} },
  MB: { enabled: false, label: "MB Environmental Fee", tagFeeByFlag: {} },
};
