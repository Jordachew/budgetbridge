import { Banknote, HandCoins, CircleDollarSign } from 'lucide-react';

export const KINDS = [
  { id: 'pay', label: 'Pay', tone: 'green', icon: Banknote, hint: 'Pay you earned for a load.' },
  { id: 'advance', label: 'Advance', tone: 'amber', icon: HandCoins, hint: 'Cash handed to you before you settle up. It is taken off what you are owed.' },
  { id: 'other', label: 'Other', tone: 'neutral', icon: CircleDollarSign, hint: 'Any other money in, like a bonus or a refund.' },
];
export const kindOf = (id) => KINDS.find((k) => k.id === id) || KINDS[2];
export const loadLabel = (l) => [l.reference, l.customer].filter(Boolean).join(' · ') || 'Load';
