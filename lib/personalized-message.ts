/** Cal.com booking link for the video landing page CTA. */
export const CAL_BOOKING_URL = "https://cal.com/amr-mohamed/30min";

export function firstNameFromName(name: string): string {
  const first = (name.split(/\s+/)[0] ?? name).trim();
  return first || "there";
}

/** Body copy below the greeting (watch page + email). */
export function personalizedVideoIntroBody(): string {
  return "I have made this video specifically for you, plz click the image down below to view it";
}

/** Full single-line intro (e.g. exports). */
export function personalizedVideoIntro(name: string): string {
  return `Hi ${firstNameFromName(name)}, ${personalizedVideoIntroBody()}`;
}

/** Small hint placed directly above the video player. */
export const VIDEO_NEAR_HINT = "Click the image to watch your video";
