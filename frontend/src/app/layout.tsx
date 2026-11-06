import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const fraunces = localFont({
  src: [
    { path: "../../public/fonts/Fraunces.woff2", weight: "400 600", style: "normal" },
    { path: "../../public/fonts/Fraunces-Italic.woff2", weight: "400 600", style: "italic" },
  ],
  variable: "--font-fraunces",
  display: "swap",
});
const inter = localFont({
  src: "../../public/fonts/Inter.woff2",
  variable: "--font-inter",
  weight: "400 700",
  display: "swap",
});
const jetbrainsMono = localFont({
  src: "../../public/fonts/JetBrainsMono.woff2",
  variable: "--font-jetbrains-mono",
  weight: "400 600",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ripple | Portfolio Research Viewer",
  description:
    "Explore volatility forecasts, portfolio decisions, historical replay, and label integrity research.",
};

const THEME_INIT_SCRIPT = `
(function() {
  try {
    var savedTheme = localStorage.getItem('ripple-theme');
    var theme = (savedTheme === 'dark' || savedTheme === 'light') ? savedTheme : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    var savedMotion = localStorage.getItem('ripple-reduced-motion');
    var reduceMotion = savedMotion === 'true' || (savedMotion !== 'false' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    document.documentElement.setAttribute('data-reduced-motion', String(reduceMotion));
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-canvas text-text antialiased selection:bg-action selection:text-action-fg">
        {children}
      </body>
    </html>
  );
}
