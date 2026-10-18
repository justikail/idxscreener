import type { Config } from "tailwindcss";

// "Lembar Bursa": kertas hangat, tinta hitam, aksen kunyit. Palet slate/
// emerald/red/amber dipetakan ulang agar halaman lama ikut bahasa visual yang
// sama tanpa ditulis ulang satu per satu.
const ink = {
  50: "#faf7f1",
  100: "#f1ebe0",
  200: "#e2d9c8",
  300: "#cdc1ab",
  400: "#a3967f",
  500: "#7c705c",
  600: "#5c5243",
  700: "#433b30",
  800: "#2a251e",
  900: "#17140f",
  950: "#0d0b08",
};

const up = {
  50: "#ecf6f0",
  100: "#d4ebdd",
  200: "#a8d6bb",
  300: "#6fb990",
  400: "#3a9a69",
  500: "#1d8152",
  600: "#0f6b43",
  700: "#0c5636",
  800: "#0a452c",
  900: "#083823",
  950: "#041f13",
};

const down = {
  50: "#fcefec",
  100: "#f8dbd4",
  200: "#f0b5a8",
  300: "#e58572",
  400: "#d95c45",
  500: "#c8402a",
  600: "#a93220",
  700: "#87281b",
  800: "#6b2218",
  900: "#561d15",
  950: "#2f0d08",
};

const kunyit = {
  50: "#fdf7e7",
  100: "#faecc2",
  200: "#f4d88a",
  300: "#ecc04f",
  400: "#e3a826",
  500: "#d38f0f",
  600: "#b4700a",
  700: "#8f540d",
  800: "#744312",
  900: "#613813",
  950: "#381c06",
};

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f4efe5",
        card: "#fbf8f2",
        ink,
        up,
        down,
        kunyit,
        slate: ink,
        emerald: up,
        red: down,
        amber: kunyit,
        blue: { 100: "#e6e9ee", 800: "#1f2d44" },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "tip-in": {
          "0%": { opacity: "0", transform: "translateY(3px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        ticker: "ticker 70s linear infinite",
        rise: "rise 500ms cubic-bezier(.2,.7,.2,1) both",
        "tip-in": "tip-in 120ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
