import './globals.css';
import Navbar from '../components/Navbar';

export const metadata = {
  title: 'RAWagon OS',
  description: 'Unified Base L2 fintech dashboard — AllCard, GoldSnap, QWKS, AutoIQ',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main className="min-h-screen px-4 py-8 max-w-7xl mx-auto">{children}</main>
      </body>
    </html>
  );
}
