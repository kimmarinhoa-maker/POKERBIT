import { SubClub, LaunchRow } from '@/types/launches';

// SVG data-uri logos para mock (em producao virao do Supabase Storage)
function mockLogo(initial: string, bg: string): string {
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' rx='12' fill='${encodeURIComponent(bg)}'/%3E%3Ctext x='32' y='43' text-anchor='middle' font-size='26' font-weight='bold' font-family='sans-serif' fill='white'%3E${initial}%3C/text%3E%3C/svg%3E`;
}

const logos = {
  imperio: mockLogo('I', '#d97706'),
  confraria: mockLogo('C', '#7c3aed'),
  bet3: mockLogo('3', '#2563eb'),
  tgp: mockLogo('T', '#059669'),
  ch: mockLogo('C', '#dc2626'),
};

export const mockSubClubs: SubClub[] = [
  { id: 'sc-imperio', name: 'Imperio', icon: '\u{1F451}', logoUrl: logos.imperio },
  { id: 'sc-confraria', name: 'Confraria', icon: '\u{1F36A}', logoUrl: logos.confraria },
  { id: 'sc-3bet', name: '3Bet', icon: '\u{1F0CF}', logoUrl: logos.bet3 },
  { id: 'sc-tgp', name: 'TGP', icon: '\u{1F3C6}', logoUrl: logos.tgp },
  { id: 'sc-ch', name: 'CH', icon: '\u{26A1}', logoUrl: logos.ch },
];

// Gera launches zerados a partir dos subclubes
export const mockLaunches: LaunchRow[] = mockSubClubs.map((c) => ({
  subclubId: c.id,
  subclubName: c.name,
  icon: c.icon,
  logoUrl: c.logoUrl,
  overlay: 0,
  compras: 0,
  security: 0,
  outros: 0,
  total: 0,
  obs: '',
}));
