import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ripple · Temporal Integrity & Portfolio Strategy Research Viewer",
  description:
    "Read-only research viewer for the ML Stock Simulator leakage audit and Ripple Phases 3–6 volatility forecast and portfolio replay laboratory.",
};

const THEME_INIT_SCRIPT = `
(function() {
  try {
    var savedTheme = localStorage.getItem('ripple-theme');
    var theme = (savedTheme === 'dark' || savedTheme === 'light') ? savedTheme : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    var savedMotion = localStorage.getItem('ripple-reduced-motion');
    if (savedMotion === 'true') {
      document.documentElement.setAttribute('data-reduced-motion', 'true');
    }
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
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-canvas text-text antialiased selection:bg-action selection:text-action-fg">
        {children}
      </body>
    </html>
  );
}
