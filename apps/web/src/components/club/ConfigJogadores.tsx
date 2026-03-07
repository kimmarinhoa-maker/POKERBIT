'use client';

import { useToast } from '@/components/Toast';
import JogadoresTab from '@/components/players/JogadoresTab';

interface Props {
  subclubOrgId: string;
}

export default function ConfigJogadores({ subclubOrgId }: Props) {
  const { toast } = useToast();

  return <JogadoresTab toast={toast} subclubId={subclubOrgId} />;
}
