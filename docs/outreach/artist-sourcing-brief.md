# Artist and venue sourcing brief

> The team's original brief, with Appendix A and filters F1–F8, has not been added yet. This file records the rules the code implements today, in `supabase/functions/_shared/outreach/rules.ts`, so they can be checked against the brief. It holds no lead data.

## Ground rules

- **Simulation only.** No email leaves today. Every "send" is stored with status `simulated` and logged. The `OUTREACH_SIMULATE` secret defaults to true.
- **Sources.** Only public business contacts posted for booking. No Instagram or TikTok scraping, and no DMs. Competitor marketplaces (gigsalad.com, thebash.com, bookingagentinfo.com) are never used as sources.
- **One message per lead.** Every email has an opt-out link. `do_not_contact` is checked before saving and again before sending.
- **No invented claims or partnerships.** The sample venues are not partners.
- **Lead data is server-only.** The tables have RLS on with no policies for anon or authenticated users, and `leads.json` and `*.csv` are ignored by git.

## Artists: Bandcamp and SoundCloud only

**Appendix A, the query matrix.** Each borough (Brooklyn, Manhattan, Queens, Bronx, Staten Island) is crossed with each genre group (singer-songwriter or acoustic, jazz/soul/R&B, DJ or electronic, indie/rock). Each pair is searched with two phrasings, for 40 queries in total. Results are limited to bandcamp.com and soundcloud.com.

| Rule | Keeps a page when |
| --- | --- |
| F1 | It is an artist page on Bandcamp or SoundCloud. Marketplaces, social networks and platform pages are dropped. |
| F2 | The page shows NYC evidence, such as a borough, a neighbourhood, NYC or New York. |
| F3 | It is an artist, not a label, collective, promoter, radio show or podcast. |
| F4 | The artist is emerging, with no mention of a major label. |
| F5 | The artist isn't inactive. A page whose latest year is more than two years old is dropped, and a page with no year passes but gets no "recent" points. |
| F6 | The music fits one of the four genre groups. |
| F7 | There is a public email for contact. Without one, the lead is saved as `contact_form` and never emailed. |
| F8 | The lead isn't already stored, by page or by email, and isn't on `do_not_contact`. |

**Artist score, out of 100:**

| Signal | Points |
| --- | --- |
| NYC confirmed | 30 |
| Public email | 25 |
| Genre fit | 20 |
| Recent activity | 15 |
| Bio of 200 characters or more | 10 |

A lead with an email and a score of 70 or more is auto-approved today.

## Venues: bars first

Emerging artists get booked in small bars first, so the matrix crosses 20 neighbourhoods in all five boroughs with bar-type searches first: bar live music, cocktail bar jazz night, dive bar bands, wine bar acoustic, and lounge DJ night. Small music venues come last.

**A venue page is kept when it:**
- is not a directory, listing, listicle or social network
- shows an NYC address
- publishes a booking or events email
- is not a chain or an agency
- has no stated capacity above 300

**Venue score, out of 100:**

| Signal | Points |
| --- | --- |
| NYC address | 25 |
| Booking email (a general one scores 15) | 25 |
| Bar (restaurant or café 12, music venue 10, other 5) | 25 |
| Live-music evidence | 15 |
| Recent activity | 10 |

A score of 70 or more is auto-approved.

## Emails

Mack writes one email of 120 words or fewer per approved lead, in his own voice, using only the product facts and one real detail from the lead's page. Code always appends the signup link (`APP_URL/?ref=<lead id>`), the sender line and the one-click opt-out link. If the AI is unavailable, a fixed, honest template is used instead.
