import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crate Digger | Spotify Client",
  description: "AI-native Spotify curation tool using semantic intent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex flex-col h-screen overflow-hidden bg-black text-white">
        {children}
      </body>
    </html>
  );
}
