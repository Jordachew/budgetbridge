import { Fuel, ParkingSquare, BedDouble, Building2, Warehouse, MapPin, AlertTriangle, Waves, Construction, Siren, Wrench, Truck, Mountain, Flag } from 'lucide-react';

export const PLACE_KINDS = [
  { id: 'fuel', label: 'Fuel', color: '#f97316', glyph: 'F', icon: Fuel },
  { id: 'parking', label: 'Parking', color: '#6366f1', glyph: 'P', icon: ParkingSquare },
  { id: 'rest', label: 'Rest stop', color: '#14b8a6', glyph: 'R', icon: BedDouble },
  { id: 'customer', label: 'Customer', color: '#0ea5e9', glyph: 'C', icon: Building2 },
  { id: 'yard', label: 'Yard', color: '#a855f7', glyph: 'Y', icon: Warehouse },
  { id: 'other', label: 'Other', color: '#64748b', glyph: '•', icon: MapPin },
];
export const placeKind = (id) => PLACE_KINDS.find((k) => k.id === id) || PLACE_KINDS[PLACE_KINDS.length - 1];

export const ALERT_ICONS = { alert: AlertTriangle, flood: Waves, road: Construction, siren: Siren, wrench: Wrench, truck: Truck, landslide: Mountain, fuel: Fuel, flag: Flag };
export const ALERT_GLYPH = { accident: '!', flood: '~', roadworks: '#', police: 'P', breakdown: 'B', traffic: 'T', landslide: 'L', fuel: 'F', other: '?' };

export const navTarget = (p) => `${p.lat},${p.lng}`;
