/**
 * Mock election data (election details + positions).
 *
 * This file only feeds js/mock-api.js. The UI never imports it directly
 */

export const ELECTION = {
  id: "su-2025-2026",
  name: "Student Union Election",
  academicYear: "2025/2026",
  organisation: "Student Union",
  status: "open",
  opensAt: "2026-10-05T08:00:00Z",
  closesAt: "2026-10-09T17:00:00Z",
};

/** Positions are rendered in ascending `order`. The UI never assumes a count. */
export const POSITIONS = [
  {
    id: "president",
    order: 1,
    title: "President",
    description:
      "Chief Executive Officer of the Student Union, representing students on University Council and Senate.",
    required: true,
    maxSelections: 1,
  },
  {
    id: "vice-president",
    order: 2,
    title: "Vice President",
    description:
      "Deputises for the President and oversees inter-faculty coordination and campus societies.",
    required: true,
    maxSelections: 1,
  },
  {
    id: "general-secretary",
    order: 3,
    title: "General Secretary",
    description:
      "Custodian of Union records, elections governance, and constitutional adherence.",
    required: true,
    maxSelections: 1,
  },
  {
    id: "assistant-general-secretary",
    order: 4,
    title: "Assistant General Secretary",
    description:
      "Assists the General Secretary in day-to-day administrative operations and council minutes.",
    required: true,
    maxSelections: 1,
  },
  {
    id: "treasurer",
    order: 5,
    title: "Treasurer",
    description:
      "Oversees union accounts, audit reporting, and budget disbursement across 120+ clubs.",
    required: true,
    maxSelections: 1,
  },
  {
    id: "financial-secretary",
    order: 6,
    title: "Financial Secretary",
    description:
      "Maintains financial ledgers and co-signs union capital project requisitions.",
    required: true,
    maxSelections: 1,
  },
  {
    id: "organising-secretary",
    order: 7,
    title: "Organising Secretary",
    description:
      "Coordinates campus events, annual student festivals, and student union logistics.",
    required: true,
    maxSelections: 1,
  },
  {
    id: "public-relations-officer",
    order: 8,
    title: "Public Relations Officer",
    description:
      "Leads press relations, union digital channels, newsletters, and public campaigns.",
    required: true,
    maxSelections: 1,
  },
  {
    id: "welfare-secretary",
    order: 9,
    title: "Welfare Secretary",
    description:
      "Advocates for physical and mental health resources, student pantry, and housing advisory.",
    required: true,
    maxSelections: 1,
  },
  {
    id: "internal-auditor",
    order: 10,
    title: "Internal Auditor",
    description:
      "Conducts independent inspections of accounts and executive constitutional compliance.",
    required: true,
    maxSelections: 1,
  },
  {
    id: "projects-development-coordinator",
    order: 11,
    title: "Projects and Development Coordinator",
    description:
      "Steers long-term campus infrastructure projects, study pods, and green campus initiatives.",
    required: true,
    maxSelections: 1,
  },
];

/** Static informational copy shown by the footer links (placeholders). */
export const INFO_PANELS = {
  regulations: {
    title: "Electoral Regulations",
    body: "Ballots are single-submission and secret. ",
  },
  audit: {
    title: "Auditing Standards",
    body: "Verification details will be published by the Returning Officer after the polls close.",
  },
  help: {
    title: "Helpdesk",
    body: "The Polling Clerk support desk is open in Union Building, Room 102. ",
  },
};
