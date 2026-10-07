import { Navigation, ExternalLink } from 'lucide-react';
import { Button } from '../../components/ui.jsx';
import { mapsLink, wazeLink } from '../../core/geo.js';
import { navTarget } from './kinds.js';

export function NavButtons({ p, size = 'sm' }) {
  return (
    <div className="flex gap-1.5">
      <Button as="a" size={size} variant="soft" icon={Navigation} href={mapsLink({ destination: navTarget(p) })} target="_blank" rel="noreferrer">Google</Button>
      <Button as="a" size={size} variant="soft" icon={ExternalLink} href={wazeLink(navTarget(p))} target="_blank" rel="noreferrer">Waze</Button>
    </div>
  );
}
