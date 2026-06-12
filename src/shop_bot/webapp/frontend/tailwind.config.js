/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
          elevated: "hsl(var(--card-elevated))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        stealthx: {
          bg: "#05010F",
          card: "#0D0818",
          accent: "#6D28FF",
          glow: "#8B5CFF",
          text: "#FFFFFF",
          muted: "#9CA3AF",
          success: "#22C55E",
          danger: "#EF4444",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: [
          "Montserrat",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        widget: "0 25px 20px -20px rgba(0,0,0,0.1), 0 0 15px rgba(0,0,0,0.06)",
        neon: "0 0 40px rgba(109, 40, 255, 0.35), 0 0 80px rgba(139, 92, 255, 0.15)",
        "neon-sm": "0 0 20px rgba(109, 40, 255, 0.4)",
        "neon-lg": "0 0 60px rgba(109, 40, 255, 0.5), 0 0 120px rgba(139, 92, 255, 0.2)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(109, 40, 255, 0.3)" },
          "50%": { boxShadow: "0 0 40px rgba(139, 92, 255, 0.6)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.5s infinite",
        float: "float 6s ease-in-out infinite",
        "pulse-glow": "pulseGlow 3s ease-in-out infinite",
      },
      backdropBlur: {
        sx: "20px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
