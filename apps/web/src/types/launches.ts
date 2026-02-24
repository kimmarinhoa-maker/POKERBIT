export interface SubClub {
  id: string;
  name: string;
  icon: string;
  logoUrl?: string | null;
}

export interface ClubAdjustment {
  overlay: number;
  compras: number;
  security: number;
  outros: number;
  obs: string;
}

export interface LaunchRow {
  subclubId: string;
  subclubName: string;
  icon: string;
  logoUrl?: string | null;
  overlay: number;
  compras: number;
  security: number;
  outros: number;
  total: number;
  obs: string;
}

export interface OverlayConfig {
  totalOverlay: number;
  selectedClubIds: string[];
}
