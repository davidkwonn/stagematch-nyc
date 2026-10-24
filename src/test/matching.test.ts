import { describe, it, expect } from "vitest";
import {
  bookedNights,
  expand,
  explain,
  overlaps,
  rank,
  scoreArtist,
  todayNY,
  type AvailabilityRow,
  type MatchArtist,
  type MatchVenue,
} from "@/data/matching";

// Friday Oct 24 2026
const TODAY = "2026-10-24";
const venue: MatchVenue = {
  borough: "Manhattan",
  genres: ["jazz", "soul"],
  budget_usd: 200,
  set_length_min: 60,
  start_date: null,
};
const artist = (id: string, over: Partial<MatchArtist> = {}): MatchArtist => ({
  id,
  borough: "Manhattan",
  genres: ["jazz"],
  rate_usd: 150,
  start_date: null,
  vetting: "unverified",
  ...over,
});
const weekly = (
  owner_id: string,
  weekday: number,
  start = "19:00",
  end = "23:00",
): AvailabilityRow => ({
  owner_id,
  kind: "weekly",
  date: null,
  weekday,
  start_time: start,
  end_time: end,
});
const dated = (
  owner_id: string,
  date: string,
  start = "19:00",
  end = "23:00",
): AvailabilityRow => ({
  owner_id,
  kind: "date",
  date,
  weekday: null,
  start_time: start,
  end_time: end,
});
const base = () => ({
  venue,
  venueAvailability: [weekly("v", 5, "20:00", "23:00")],
  artists: [artist("a")],
  artistAvailability: [weekly("a", 5)],
  exclude: new Set<string>(),
  today: TODAY,
});

describe("Matching", () => {
  it("puts weekly slots on every matching weekday for 6 weeks", () => {
    const w = expand([weekly("a", 5)], TODAY);
    expect(w.length).toBe(6);
    expect(w[0]?.date).toBe("2026-10-30");
  });

  it("keeps dated slots inside the window and respects the start date", () => {
    expect(
      expand(
        [dated("a", "2026-10-25"), dated("a", "2027-02-01"), dated("a", "2026-10-20")],
        TODAY,
      ).map((w) => w.date),
    ).toEqual(["2026-10-25"]);
    expect(expand([weekly("a", 5)], TODAY, 42, "2026-11-01")[0]?.date).toBe("2026-11-06");
  });

  it("needs the full set length, an evening start, and handles slots past midnight", () => {
    const v = expand([dated("v", "2026-10-30", "20:00", "23:00")], TODAY);
    expect(overlaps(v, expand([dated("a", "2026-10-30", "22:30", "23:59")], TODAY), 60)).toEqual(
      [],
    );
    expect(
      overlaps(v, expand([dated("a", "2026-10-30", "21:00", "23:00")], TODAY), 60)[0]?.start,
    ).toBe("21:00");
    const late = overlaps(
      expand([dated("v", "2026-10-30", "22:00", "02:00")], TODAY),
      expand([dated("a", "2026-10-30", "23:00", "01:00")], TODAY),
      90,
    );
    expect(late[0]?.start).toBe("23:00");
  });

  it("scores genre, pay, borough and verification", () => {
    const slots = [{ date: "2026-10-30", start: "21:00", weekday: 5 }];
    const verified = scoreArtist(
      venue,
      artist("a", { vetting: "verified", genres: ["jazz", "soul"] }),
      slots,
    ).score;
    const plain = scoreArtist(venue, artist("b"), slots).score;
    const pricey = scoreArtist(
      venue,
      artist("c", { rate_usd: 500, genres: ["metal"], borough: "Staten Island" }),
      slots,
    ).score;
    expect(verified).toBeGreaterThan(plain);
    expect(plain).toBeGreaterThan(pricey);
  });

  it("writes a reason a venue owner would read", () => {
    const slots = [
      { date: "2026-10-30", start: "21:00", weekday: 5 },
      { date: "2026-11-06", start: "21:00", weekday: 5 },
    ];
    expect(
      explain(venue, artist("a", { genres: ["jazz", "soul"], vetting: "verified" }), slots, [
        "jazz",
        "soul",
      ]),
    ).toBe(
      "Plays jazz and soul, free Fridays 9 pm, $150 within your $200 budget, verified by NYC bookers",
    );
  });

  it("keeps the top 5 and skips answered, rejected and no-overlap artists", () => {
    const artists = Array.from({ length: 8 }, (_, i) =>
      artist(`a${i}`, { rate_usd: 100 + i * 20 }),
    );
    const result = rank({
      ...base(),
      artists: [...artists, artist("nobody"), artist("rejected", { vetting: "rejected" })],
      artistAvailability: [
        ...artists.map((a) => weekly(a.id, 5)),
        weekly("nobody", 2),
        weekly("rejected", 5),
      ],
      exclude: new Set(["a0"]),
    });
    expect(result.length).toBe(5);
    expect(result.some((r) => ["a0", "nobody", "rejected"].includes(r.artist_id))).toBe(false);
    expect(result[0]).toMatchObject({ slot_date: "2026-10-30", slot_start: "20:00" });
  });

  it("never suggests a night already booked by the artist or the venue", () => {
    expect(rank(base())[0]?.slot_date).toBe("2026-10-30");
    expect(
      rank({ ...base(), artistBooked: new Map([["a", new Set(["2026-10-30"])]]) })[0]?.slot_date,
    ).toBe("2026-11-06");
    expect(
      rank({ ...base(), venueBooked: new Set(["2026-10-30", "2026-11-06"]) })[0]?.slot_date,
    ).toBe("2026-11-13");
  });

  it("groups booked nights by artist and venue", () => {
    const n = bookedNights([
      { artist_id: "a", venue_id: "v", gig_date: "2026-10-30" },
      { artist_id: "a", venue_id: "w", gig_date: null },
    ]);
    expect([...(n.artist.get("a") ?? [])]).toEqual(["2026-10-30"]);
    expect(n.venue.has("w")).toBe(false);
  });

  it("uses the New York date", () => {
    expect(todayNY(new Date("2026-10-25T02:00:00Z"))).toBe("2026-10-24");
  });
});
