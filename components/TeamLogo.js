import { logoUrl } from '@/lib/teams';

// Small team logo from ESPN's image CDN; the abbreviation stays as text beside it.
export default function TeamLogo({ abbr, size = 20 }) {
  return (
    <img
      src={logoUrl(abbr, size * 2)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      style={{ verticalAlign: 'middle', marginRight: 4, flex: 'none' }}
    />
  );
}
