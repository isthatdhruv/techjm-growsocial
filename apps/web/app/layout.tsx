import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'TechJM — AI-Powered Social Media Automation',
  description:
    '4-LLM discovery, 7 sub-agent analysis, adaptive feedback. Your content, automated.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-surface text-text antialiased`}>{children}</body>
    </html>
  );
}
