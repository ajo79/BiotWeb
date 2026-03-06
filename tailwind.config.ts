import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx,jsx,js}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F172A",
        amber: "#F59E0B",
        ocean: "#0EA5E9",
        mist: "#E2E8F0",
        card: "#0B1220",
        panel: "#0D1424"
      },
      fontFamily: {
        display: ['"Space Grotesk"', '"Inter Tight"', 'system-ui', 'sans-serif'],
        body: ['"Inter Tight"', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        glow: "0 10px 50px rgba(14,165,233,0.25)",
        card: "0 24px 60px rgba(0,0,0,0.35)"
      },
      animation: {
        fadeIn: "fadeIn 0.6s ease",
        float: "float 6s ease-in-out infinite"
      },
      keyframes: {
        fadeIn: { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        float: { '0%,100%': { transform: 'translateY(-4px)' }, '50%': { transform: 'translateY(4px)' } }
      }
    }
  },
  plugins: []
};

export default config;
