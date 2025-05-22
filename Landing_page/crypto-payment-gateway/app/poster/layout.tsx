import type { Metadata } from 'next';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Payment QR Code Poster',
  description: 'Scan this QR code to make a test payment on the blockchain',
};

export default function PosterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-white">
        {children}
      </body>
    </html>
  );
} 