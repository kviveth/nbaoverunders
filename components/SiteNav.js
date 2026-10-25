'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  ['/', 'Home'],
  ['/rules', 'Rules & scoring'],
  ['/commish', 'Commissioner'],
];

// Top banner on every page.
export default function SiteNav() {
  const path = usePathname();
  return (
    <nav className="sitenav">
      <div className="sitenav-inner">
        <Link href="/" className="brand">🏀 O/U Draft</Link>
        <div className="sitenav-links">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? 'on' : ''}>{label}</Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
