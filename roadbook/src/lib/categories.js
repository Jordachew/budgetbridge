import { Fuel, Milestone, Utensils, Wrench, CircleDot, ParkingSquare, Flag, BedDouble, Phone, FileText, User, MoreHorizontal } from 'lucide-react';
import { CATEGORIES } from '../core/receipt.js';

const ICONS = { fuel: Fuel, toll: Milestone, food: Utensils, repairs: Wrench, tyres: CircleDot, parking: ParkingSquare, fines: Flag, lodging: BedDouble, phone: Phone, permits: FileText, wages: User, other: MoreHorizontal };
export const categoryIcon = (id) => ICONS[id] || MoreHorizontal;
export { CATEGORIES };
// One colour per category, used by charts and chips. Chosen to stay distinct in light and dark.
export const CATEGORY_COLORS = {
  fuel: '#f97316', toll: '#0ea5e9', food: '#84cc16', repairs: '#ef4444', tyres: '#64748b', parking: '#a855f7',
  fines: '#e11d48', lodging: '#14b8a6', phone: '#6366f1', permits: '#eab308', wages: '#ec4899', other: '#94a3b8',
};
