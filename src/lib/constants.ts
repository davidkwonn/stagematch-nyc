export const GENRES = [
  "Rock",
  "Punk",
  "Indie",
  "Jazz",
  "Hip-Hop",
  "R&B / Soul",
  "Electronic",
  "Folk",
  "Pop",
  "Latin",
  "Blues",
  "Country",
  "Metal",
  "Classical",
  "Reggae",
  "Experimental",
] as const;

export const BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "The Bronx", "Staten Island"] as const;

export const VENUE_TYPES = ["Bar", "Club", "Music venue", "Restaurant", "Café", "Rooftop", "Other"] as const;

export function ageFrom(birthday: string) {
  const b = new Date(birthday);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "Talking with manager",
  confirmed: "Booked",
  declined: "Declined",
};
