/** Mock candidates used only by js/mock-api.js. */

let nextCandidateImage = 0;
const candidate = (positionId, id, name, affiliation, description) => {
  nextCandidateImage += 1;
  return {
    id,
    positionId,
    name,
    affiliation,
    description,
    image: `/assets/images/image${nextCandidateImage}.jpeg`,
  };
};

export const CANDIDATES_BY_POSITION = {
  president: [
    candidate(
      "president",
      "pres-1",
      "Amara Okonjo",
      "School of Engineering",
      "Student housing affordability and 24/7 library opening hours.",
    ),

    candidate(
      "president",
      "pres-2",
      "Daniel Mensah",
      "School of Business",
      "A transparent union budget and stronger student representation.",
    ),

    candidate(
      "president",
      "pres-3",
      "Leila Haddad",
      "School of Arts",
      "More accessible campus services and inclusive student events.",
    ),
  ],

  "vice-president": [
    candidate(
      "vice-president",
      "vp-1",
      "Chidi Okafor",
      "School of Science",
      "Coordinate societies and make campus activities easier to access.",
    ),

    candidate(
      "vice-president",
      "vp-2",
      "Nia Williams",
      "School of Law",
      "Improve communication between faculties and the union.",
    ),

    candidate(
      "vice-president",
      "vp-3",
      "Kwame Boateng",
      "School of Education",
      "Build practical support for student-led organisations.",
    ),
  ],

  "general-secretary": [
    candidate(
      "general-secretary",
      "gs-1",
      "Aisha Bello",
      "School of Law",
      "Publish clear minutes and accessible records after every council meeting.",
    ),

    candidate(
      "general-secretary",
      "gs-2",
      "Peter Nwosu",
      "School of Computing",
      "Modernise union records and improve constitutional awareness.",
    ),

    candidate(
      "general-secretary",
      "gs-3",
      "Maya Patel",
      "School of Humanities",
      "Keep union decisions organised, transparent, and easy to find.",
    ),
  ],

  "assistant-general-secretary": [
    candidate(
      "assistant-general-secretary",
      "ags-1",
      "Samuel Adeyemi",
      "School of Business",
      "Support reliable administration and timely council follow-up.",
    ),

    candidate(
      "assistant-general-secretary",
      "ags-2",
      "Zara Ibrahim",
      "School of Medicine",
      "Make union processes clearer for students and representatives.",
    ),
    candidate(
      "assistant-general-secretary",
      "ags-3",
      "Emeka Eze",
      "School of Engineering",
      "Improve meeting coordination and student access to records.",
    ),
  ],
  treasurer: [
    candidate(
      "treasurer",
      "treas-1",
      "Grace Osei",
      "School of Business",
      "Share regular budget updates and strengthen financial oversight.",
    ),
    candidate(
      "treasurer",
      "treas-2",
      "Noah Clarke",
      "School of Science",
      "Make funding decisions consistent and accountable.",
    ),

    candidate(
      "treasurer",
      "treas-3",
      "Fatima Yusuf",
      "School of Arts",
      "Help clubs plan with clear funding guidance.",
    ),
  ],

  "financial-secretary": [
    candidate(
      "financial-secretary",
      "fs-1",
      "David Kimani",
      "School of Economics",
      "Maintain accurate ledgers and publish accessible summaries.",
    ),

    candidate(
      "financial-secretary",
      "fs-2",
      "Ruth Mensah",
      "School of Business",
      "Simplify club reimbursement and funding processes.",
    ),

    candidate(
      "financial-secretary",
      "fs-3",
      "Ibrahim Sule",
      "School of Computing",
      "Bring consistency and clarity to financial records.",
    ),
  ],
  "organising-secretary": [
    candidate(
      "organising-secretary",
      "os-1",
      "Tomi Adebayo",
      "School of Arts",
      "Plan welcoming events with more opportunities for student groups.",
    ),
    candidate(
      "organising-secretary",
      "os-2",
      "Ella Thompson",
      "School of Education",
      "Make campus events more accessible and better coordinated.",
    ),
    candidate(
      "organising-secretary",
      "os-3",
      "Yusuf Ali",
      "School of Engineering",
      "Improve event logistics and student participation.",
    ),
  ],
  "public-relations-officer": [
    candidate(
      "public-relations-officer",
      "pro-1",
      "Miriam Kone",
      "School of Media",
      "Share timely, clear updates across channels students use.",
    ),
    candidate(
      "public-relations-officer",
      "pro-2",
      "Ben Okoro",
      "School of Computing",
      "Make union announcements easier to find and understand.",
    ),
    candidate(
      "public-relations-officer",
      "pro-3",
      "Sofia Rahman",
      "School of Social Sciences",
      "Give student voices a stronger place in union communications.",
    ),
  ],
  "welfare-secretary": [
    candidate(
      "welfare-secretary",
      "ws-1",
      "Joyce Abena",
      "School of Health Sciences",
      "Improve signposting to wellbeing and housing support.",
    ),
    candidate(
      "welfare-secretary",
      "ws-2",
      "Michael Dube",
      "School of Law",
      "Expand practical support and student welfare outreach.",
    ),
    candidate(
      "welfare-secretary",
      "ws-3",
      "Hana Sato",
      "School of Science",
      "Promote inclusive wellbeing services across campus.",
    ),
  ],
  "internal-auditor": [
    candidate(
      "internal-auditor",
      "ia-1",
      "Omar Farouk",
      "School of Economics",
      "Use consistent checks and clear reporting for union accounts.",
    ),
    candidate(
      "internal-auditor",
      "ia-2",
      "Priya Shah",
      "School of Computing",
      "Strengthen independent review and record keeping.",
    ),
    candidate(
      "internal-auditor",
      "ia-3",
      "Alex Morgan",
      "School of Business",
      "Make audit findings clear, timely, and actionable.",
    ),
  ],
  "projects-development-coordinator": [
    candidate(
      "projects-development-coordinator",
      "pdc-1",
      "Esi Owusu",
      "School of Architecture",
      "Develop useful study spaces and sustainable campus projects.",
    ),
    candidate(
      "projects-development-coordinator",
      "pdc-2",
      "Jonah Peters",
      "School of Engineering",
      "Prioritise practical infrastructure improvements for students.",
    ),
    candidate(
      "projects-development-coordinator",
      "pdc-3",
      "Lina Hassan",
      "School of Environmental Studies",
      "Support greener campus facilities and long-term planning.",
    ),
  ],
};
