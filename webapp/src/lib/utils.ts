import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "funny, #reaction" → ["funny", "reaction"] */
export function splitTags(text: string): string[] {
  return text.split(/[,#]/).map((tag) => tag.trim()).filter(Boolean);
}
