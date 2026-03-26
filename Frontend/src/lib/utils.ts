import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: any, formatStr: string) {
  if (!date) return '';
  let d: Date;
  
  if (typeof date === 'number') {
    d = new Date(date);
  } else if (date instanceof Date) {
    d = date;
  } else if (date && typeof date.toDate === 'function') {
    d = date.toDate();
  } else if (date && date.seconds !== undefined) {
    // Handle plain objects that look like Firestore Timestamps (sometimes happens during serialization)
    d = new Date(date.seconds * 1000 + (date.nanoseconds || 0) / 1000000);
  } else {
    try {
      d = new Date(date);
    } catch (e) {
      return '';
    }
  }
  
  if (isNaN(d.getTime())) return '';
  
  return format(d, formatStr);
}
