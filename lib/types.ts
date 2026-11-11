// Shapes shared by API routes and screens. Nothing here carries email, phone,
// address or payment details: the member screens never need them.

export type ScanState = "active" | "grace" | "lapsed" | "unrecognised" | "offline";
export type Tier = "Founding" | "Standard";
export type DeviceMode = "staff" | "concierge" | "welcome";

export type StatusBand = {
  state: ScanState;
  label: string; // Active, Grace...
  detail: string; // Paid and in date
  instruction: string; // Welcome them and offer benefits
};

export type BenefitRow = {
  key: string;
  title: string; // Monthly drink, or the event name for Society evenings
  sub: string; // November's drink / Used 3 Nov, 11:20am · Bar
  state: "available" | "used" | "unavailable" | "info";
  eventId?: string;
  usedAt?: string; // ISO
  redemptionId?: string;
  undoable?: boolean; // within 24h; only managers see the action
};

export type BenefitHistory = {
  key: string;
  name: string;
  count: string; // "3 this year", "0 of 1"
  lines: string[]; // "3 Oct · Bar"
  note?: string; // "Available in November"
};

export type StaffMemberView = {
  memberId: string;
  firstName: string;
  fullName: string;
  initials: string;
  photoUrl: string | null;
  tier: Tier;
  founding: boolean;
  birthdayMonth: boolean;
  band: StatusBand;
  sinceLine: string; // Member since Mar 2024 · Renews 14 Mar 2027
  today: BenefitRow[]; // redeemable now or already used this period
  canRedeem: boolean;
  extras: string[]; // "Loves translated fiction, nature writing"
};

export type Note = { id: string; body: string; by: string; date: string };
export type Visit = { when: string; station: string; today: boolean };

export type ConciergeView = StaffMemberView & {
  benefits: BenefitHistory[];
  known: { label: string; value: string }[];
  notes: Note[];
  visits: Visit[];
  visitsThisYear: number;
  displayLine: string | null; // Member screen: showing "Welcome back, Priya"
};

export type Pigeon = "coffee" | "reading" | "flying-book" | "perched" | "standing";

export type WelcomePayload =
  | { kind: "welcome"; firstName: string; eyebrow: string; line: string; pigeon: Pigeon }
  | { kind: "neutral" };

export type SplashItem = { icon: "drink" | "book" | "event" | "calendar"; title: string; sub: string };

export type SplashPayload =
  | {
      kind: "splash";
      firstName: string;
      tier: Tier;
      founding: boolean;
      line: string;
      memberSince: string;
      readyTitle: string; // Ready for you today / All collected for now
      items: SplashItem[];
      nextStep: string;
      pigeon: Pigeon;
    }
  | { kind: "neutral-splash" };

export type DisplayPayload = WelcomePayload | SplashPayload;

export type ScanResponse =
  | { kind: "member"; token: string; view: StaffMemberView | ConciergeView }
  | { kind: "unrecognised"; token: string; band: StatusBand }
  | { kind: "spare"; token: string; label: string; band: StatusBand };

export type LookupResult = {
  memberId: string;
  fullName: string;
  tierLine: string; // Founding · or Standard
  state: Exclude<ScanState, "offline">;
};

export type RecentScan = {
  at: string;
  name: string;
  memberId: string | null;
  state: ScanState;
};

export type StaffSummary = { id: string; name: string; role: "staff" | "manager" };
