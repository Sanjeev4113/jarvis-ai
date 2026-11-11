/**
 * Single source of truth for everything the site and the assistant say about Sanjeev.
 * Every line here is verified against his resumes, LinkedIn export, YouTube channel or code.
 * Do not add claims that are not sourced. Anything unknown belongs in `unknowns`.
 */

export const identity = {
  name: "Sanjeev Sudarsanam",
  firstName: "Sanjeev",
  role: "Software Developer",
  company: "Amdocs",
  team: "Core R&D",
  location: "Pune, India",
  email: "sanjeevsudarsanam@gmail.com",
  links: {
    github: "https://github.com/Sanjeev4113",
    linkedin: "https://www.linkedin.com/in/sanjeev-sudarsanam-7a60b7174",
    youtube: "https://www.youtube.com/@sanjeevsudarsanam",
    instagram: "https://www.instagram.com/sanjeev_sudarsanam/",
  },
  spokenLanguages: ["English", "Hindi", "Telugu"],
  positioning:
    "Software developer at Amdocs building backend services for enterprise telecom, and a singer who has been posting vocal covers since 2017.",
  tagline: "Backend by day. Vocals by night.",
  kolamLine: "Notation gives you the dots. The voice is the line between them.",
  bio: "I'm a Software Developer on the Core R&D team at Amdocs in Pune, working on Java and Spring Boot services for a large-scale telecom commerce platform. I studied Computer Science and Engineering at NIT Rourkela, where I was President of HeartBeats, the institute's fusion band, and Tech Head of AstroNITR. I'm now also pursuing the PGPMCI programme at IIM Visakhapatnam to strengthen the business side of my engineering. Outside work I sing, and my YouTube channel holds vocal covers in Hindi, Telugu and other languages going back to 2017.",
} as const;

/** His own words, from his submitted elevator pitch. Quote verbatim. */
export const quotes = [
  "I enjoy building technology that solves real-world problems, but beyond work, I believe that who we are outside our profession is equally important.",
  "Music has always been a huge part of my life.",
  "Performing on stage and leading a diverse team taught me confidence, creativity, collaboration, and how to stay calm under pressure.",
  "Growth comes from consistency, adaptability, and continuous learning rather than overnight success.",
  "I believe in giving my best while staying humble and open to feedback.",
] as const;

export const values = [
  "Consistency over overnight success",
  "Humility and openness to feedback",
  "Continuous learning",
  "Ownership",
  "Collaboration",
] as const;

export type Role = {
  company: string;
  title: string;
  place: string;
  start: string;
  end: string;
  summary: string;
  bullets: string[];
  stack: string[];
};

export const work: Role[] = [
  {
    company: "Amdocs",
    title: "Software Developer, Core R&D",
    place: "Pune, India",
    start: "2025-06",
    end: "present",
    summary:
      "Backend services for the catalog, pricing and shopping-cart modules of a large-scale enterprise telecom commerce platform.",
    bullets: [
      "Reduced critical API response times from 10+ seconds to under 1 second (90%+) by profiling bottlenecks and redesigning the caching strategy, TTL configuration and scheduler logic.",
      "Design and develop RESTful APIs and microservices in Java, Spring Boot and Apache Camel with PostgreSQL.",
      "Triage production incidents such as API failures and timeouts down to root cause, using application logs, stack traces, service-to-service traces, JVM and memory analysis, and database query patterns.",
      "Improved regression coverage by 30% with Cypress/TypeScript test suites and Jenkins CI/CD pipelines.",
      "Replaced manual release verification with a Python tool that queries Nexus repositories and cross-checks microservice build versions against manifest files across environments, producing human-readable and JSON reports.",
      "Code reviews focused on best practices, quality and testability; Agile Scrum with global stakeholders (JIRA, GitHub); AI coding assistants (Cursor, GitHub Copilot) for development and refactoring.",
    ],
    stack: ["Java", "Spring Boot", "Apache Camel", "PostgreSQL", "Jenkins", "Cypress", "TypeScript", "Python"],
  },
  {
    company: "Arabian Industries",
    title: "Software Developer Intern, ERP department",
    place: "Muscat, Oman",
    start: "2024-05",
    end: "2024-07",
    summary:
      "Learned how the company's ERP supports its operations, and built CHAT@AI, a secure real-time employee chat application.",
    bullets: [
      "Built CHAT@AI end-to-end: a full-stack MERN (MongoDB, Express, React, Node.js) chat application with Socket.IO real-time messaging, end-to-end encryption and MongoDB persistence.",
      "Secured user data with JWT authentication and role-based access control (RBAC) to enforce access boundaries.",
      "Worked with cross-functional teams on requirements and features.",
    ],
    stack: ["MongoDB", "Express", "React", "Node.js", "Socket.IO", "JWT"],
  },
];

/** The flagship metric, used by the "drop" visual in the Work section. */
export const flagship = {
  beforeSeconds: 10,
  afterSeconds: 1,
  label: "Critical API response time",
  how: ["Profiled the bottlenecks", "Redesigned the caching strategy", "Tuned TTL configuration", "Reworked scheduler logic"],
} as const;

export type ProjectStatus = "Accepted" | "Shipped" | "Research" | "Prototype" | "Personal";

export type Project = {
  slug: string;
  title: string;
  status: ProjectStatus;
  /** What the status means, shown on hover. */
  statusNote: string;
  period?: string;
  context: string;
  oneLiner: string;
  details: string[];
  stack: string[];
  links?: { label: string; href: string }[];
  /** Honest limits, used by the assistant. */
  caveats?: string[];
};

export const projects: Project[] = [
  {
    slug: "system-design-hub",
    title: "System Design Hub",
    status: "Accepted",
    statusNote: "Live and public",
    period: "2026",
    context: "Personal project",
    oneLiner:
      "An interactive system-design playground: drop load balancers, APIs, caches and databases on a canvas, wire them up, push traffic and watch where it breaks.",
    details: [
      "Simulated traffic model: recursive propagation over a node graph with per-node capacities (load balancer 1000, API 500, cache 800, database 300 requests per second); the cache absorbs 70% of reads.",
      "Detects patterns such as a single point of failure or a missing cache, offers one-click fixes, and generates HLD and LLD text.",
      "Practice problems, case studies, HLD and LLD tracks, and Web Speech voice commands.",
      "Includes a rule-based design assistant.",
    ],
    stack: ["React 19", "React Router", "JavaScript", "Web Speech API", "Vercel"],
    links: [{ label: "Live demo", href: "https://system-design-hub-orcin.vercel.app" }],
    caveats: ["The traffic model is heuristic, not a discrete-event simulator.", "Its assistant is rule-based, not an LLM."],
  },
  {
    slug: "chat-at-ai",
    title: "CHAT@AI",
    status: "Shipped",
    statusNote: "Built during the Arabian Industries internship",
    period: "May to Jul 2024",
    context: "Internship, Arabian Industries, Muscat",
    oneLiner: "A secure real-time employee chat application with JWT authentication and role-based access control.",
    details: [
      "Full MERN stack: MongoDB, Express, React and Node.js.",
      "Socket.IO for real-time messaging with end-to-end encryption, MongoDB for persistence.",
      "JWT authentication and RBAC to enforce access boundaries.",
    ],
    stack: ["MongoDB", "Express", "React", "Node.js", "Socket.IO", "JWT"],
    caveats: ["Built for an employer, so there is no public code or screenshot."],
  },
  {
    slug: "heat-comfort-index",
    title: "IoT Heat Comfort Index System",
    status: "Research",
    statusNote: "B.Tech research project, NIT Rourkela",
    period: "Nov 2024 to May 2025",
    context: "B.Tech research project, NIT Rourkela",
    oneLiner:
      "A hardware-to-software pipeline: sensors in the field, a live API, and a model that turns temperature and humidity into a Heat Comfort Index.",
    details: [
      "ESP32 boards with DHT11 sensors, transmitting over LoRa.",
      "Live temperature and humidity streamed to a Python/Flask REST API.",
      "An AutoKeras regression model computes the Heat Comfort Index, shown on a live dashboard.",
    ],
    stack: ["ESP32", "LoRa", "DHT11", "Python", "Flask", "AutoKeras"],
  },
  {
    slug: "job-ai",
    title: "JobAI",
    status: "Shipped",
    statusNote: "Runs on GitHub Actions; private dashboard on this site",
    period: "2026",
    context: "Personal project",
    oneLiner:
      "A job-search agent that scans 40+ official job boards (Amazon, Microsoft, Oracle, Salesforce, ServiceNow, Anthropic, Stripe and more), judges fit, tailors my LaTeX resume for each strong match and emails me a digest.",
    details: [
      "Pulls roles only from official public APIs: Greenhouse, Lever, Ashby, SmartRecruiters, Workday, and the Amazon, Microsoft and Oracle career APIs.",
      "Cheap rule filters first (role, seniority, years asked), then an LLM screens and assesses fit with evidence, gaps and ready answers.",
      "Rewrites the resume inside the exact Overleaf template, rejects any output that changes the template, and compiles it to PDF with Tectonic.",
      "Uses Claude when it has credit and otherwise a chain of free models; the resume is never sent to an anonymous model.",
      "A private dashboard on this site adds a tech-news feed, a 30-day DSA path with an in-browser practice window, A-to-Z learning tracks and a planner.",
      "Started as a Python prototype (FastAPI, sentence-transformers and FAISS for resume-to-job retrieval).",
    ],
    stack: ["TypeScript", "Node.js", "Zod", "LaTeX", "GitHub Actions", "Next.js", "LLMs"],
    links: [{ label: "GitHub", href: "https://github.com/Sanjeev4113/jobai-agent" }],
  },
  {
    slug: "lazician",
    title: "Lazician",
    status: "Shipped",
    statusNote: "Live on this site at /lazician",
    period: "2026",
    context: "Personal project, where code meets music",
    oneLiner:
      "A pocket music studio in the browser: an Omnichord-style chord pad with a strum plate and auto-rhythm, plus a tuner, metronome, tanpura drone, raga riyaz with live pitch, ear training, songwriting tools and a recorder.",
    details: [
      "Started as a React + Tone.js chord instrument (hold a root key and a modifier to strum the chord); rebuilt on the raw Web Audio API inside this site.",
      "YIN pitch detection drives the tuner, the live riyaz pitch graph, alankara scoring and a vocal range finder.",
      "Look-ahead scheduling on the audio clock keeps the metronome, rhythms and drone steady even when the page is busy.",
      "Practice timer with a daily streak; recordings never leave the device.",
    ],
    stack: ["React 19", "Web Audio API", "TypeScript", "MediaRecorder", "Canvas"],
    links: [{ label: "Open Lazician", href: "/lazician" }],
  },
  {
    slug: "skin-lesion",
    title: "Skin Cancer Lesion Classification",
    status: "Personal",
    statusNote: "Personal ML project",
    period: "Feb to Mar 2024",
    context: "Personal project",
    oneLiner: "A CNN classifier that reached 92% accuracy on the HAM10000 dermatology dataset.",
    details: [
      "Data augmentation, class balancing and hyperparameter tuning to handle a heavily imbalanced dataset.",
    ],
    stack: ["Python", "AutoKeras", "OpenCV", "TensorFlow"],
    caveats: ["A learning project, not a clinical tool. Accuracy alone overstates quality on imbalanced data."],
  },
  {
    slug: "jarvis",
    title: "JARVIS-AI",
    status: "Shipped",
    statusNote: "Personal agent, runs on my Mac and phone",
    period: "2026",
    context: "Personal project",
    oneLiner:
      "A personal AI agent I can talk to: it plans my day, sets reminders, drafts mail, teaches DSA, briefs me every morning, reports every night and only interrupts me when something matters.",
    details: [
      "Voice conversations with an on-device neural voice (Kokoro) and speech recognition with an on-device Whisper fallback.",
      "Tool calling for tasks, reminders, day plans and email drafts; anything that sends, overwrites or touches the computer needs my approval first.",
      "A Mac agent for screen reading (on-device OCR), documents, apps, Reminders and Calendar, with a native confirmation dialog for every action.",
      "A background daemon for the morning brief, nightly report, inbox triage and Telegram chat.",
      "Free models only: a local model through Ollama first, then free cloud tiers; private data never goes to an anonymous model.",
      "Grew out of my 2023 Python voice assistant (OpenAI, Deepgram, Taipy on AWS EC2).",
    ],
    stack: ["TypeScript", "Node.js", "Ollama", "Web Audio", "WebGPU", "Telegram Bot API", "IMAP"],
    links: [{ label: "GitHub", href: "https://github.com/Sanjeev4113/jarvis-ai" }],
  },
];

/** Lineup poster tiers: headliners print biggest. */
export const stack = {
  headliners: ["Java", "Spring Boot", "TypeScript", "Cypress", "PostgreSQL", "Linux"],
  mainStage: ["JavaScript", "Playwright", "MERN Stack", "Apache Camel", "REST APIs", "Microservices", "Jenkins CI/CD", "Python"],
  secondStage: ["MongoDB", "Express", "React", "Node.js", "Socket.IO", "JWT", "FastAPI", "Flask", "Web Audio", "ESP32", "LoRa"],
  craft: ["Caching & TTL design", "Performance profiling", "JVM diagnostics", "Root-cause analysis", "Code review"],
  smallPrint: [
    "SQL",
    "MS SQL Server",
    "Docker",
    "C++",
    "Git",
    "GitHub",
    "JIRA",
    "Agile Scrum",
    "TDD",
    "TensorFlow",
    "AutoKeras",
    "OpenCV",
    "scikit-learn",
    "Cursor",
    "GitHub Copilot",
    "Claude",
  ],
} as const;

export const education = [
  {
    school: "IIM Visakhapatnam",
    programme: "PGPMCI, Post Graduate Programme in Management",
    detail: "Batch 2026 to 2028, in progress alongside full-time work.",
    period: "2026 to 2028",
  },
  {
    school: "National Institute of Technology, Rourkela",
    programme: "B.Tech, Computer Science and Engineering",
    detail:
      "Coursework: Data Structures, Operating Systems, DBMS, Computer Networks, Computer Architecture, Software Engineering, Data Communication, Artificial Intelligence.",
    period: "Dec 2021 to Jun 2025",
  },
  {
    school: "Indian School Al Wadi Al Kabir, Muscat",
    programme: "CBSE Class XII, PCM with Informatics Practices",
    detail: "Class X in 2018 to 2019, Class XII in 2019 to 2021.",
    period: "2018 to 2021",
  },
] as const;

export const leadership = [
  {
    role: "President",
    org: "HeartBeats, the official fusion band of NIT Rourkela",
    period: "2023 to 2024",
    detail: "Led a 20+ member team organising cultural events and performances.",
  },
  {
    role: "Tech Head",
    org: "AstroNITR, the astronomy club",
    period: "2023 to 2024",
    detail: "Directed technical projects and astronomy workshops, and led development and launch of the club website.",
  },
  {
    role: "Treasurer",
    org: "Hourglass, the public speaking club",
    period: "May 2024 to Jun 2025",
    detail: "Financial management and sponsorship coordination for public speaking events, debates and workshops.",
  },
  {
    role: "Member",
    org: "RITVIC, NIT Rourkela",
    period: "Dec 2021 to Jun 2025",
    detail: "Street plays, cultural and community initiatives.",
  },
] as const;

export const certifications = [
  { name: "FullStack Development with Cursor", issuer: "Udemy", date: "Feb 2026" },
] as const;

export const music = {
  summary:
    "I sing. Since 2017 I've posted vocal covers on YouTube in Hindi, Telugu, Malayalam, Kannada and more, from film songs to a few that lean classical, and at NIT Rourkela I was President of HeartBeats, the institute's fusion band.",
  /** From the channel's About tab (Nov 2026). */
  channel: {
    url: "https://www.youtube.com/@sanjeevsudarsanam",
    handle: "sanjeevsudarsanam",
    joined: "2017-05-08",
    videos: 61,
    subscribers: 526,
    views: 142291,
    viewsLabel: "140K+",
  },
  firstUpload: { title: "Suno Na Sangmarmar", date: "2017-05-08" },
  uploadsByYear: { 2017: 2, 2018: 1, 2019: 1, 2020: 3, 2021: 17, 2022: 9, 2023: 12, 2024: 10, 2025: 4 } as Record<number, number>,
  languages: ["Hindi", "Telugu", "Malayalam", "Kannada"],
  featured: [
    { id: "zikdiuqrjTM", title: "Jeene Laga Hoon, unplugged", note: "The channel's most watched." },
    { id: "4e24SGsLXtY", title: "Sirivennela", note: "From Shyam Singha Roy." },
    { id: "bjWWlftSV7w", title: "Saathiya × Pon Malare × Hrudayama", note: "A Hindi, Malayalam and Telugu medley." },
    { id: "m2cx0_XWijo", title: "Mera Aasman Jal Gaya", note: "From Ponniyin Selvan 2." },
    { id: "OuD8cLR49yU", title: "Eppudo Ninnu", note: "From Sita Ramam." },
    { id: "dcNRydhcZZA", title: "Baarish", note: "With Soham Samal on guitar." },
  ],
  classicalLeaning: [
    { id: "WeehmiVxwXk", title: "Nagumomu, at a music concert in Guruvayur, Kerala", year: 2018 },
    { id: "xHmvnLkhsJI", title: "Chandrachooda, a Carnatic keerthana", year: 2023 },
    { id: "pC7G-r4t1IA", title: "Sajan Bin, with tanpura only", year: 2023 },
    { id: "FdG_mbT_gEY", title: "Lalitha Priya Kamalam", year: 2020 },
  ],
  bandNote:
    "As President of HeartBeats I led a 20+ member team organising cultural events and performances. Performing on stage taught me to stay calm under pressure.",
  collaborators: [
    "Aayush Dube",
    "Deekshitha Chaganty",
    "Shreedevi Babu Menon",
    "Nakshatra Kurup",
    "Sharan S",
    "Yashodhan Prabhugathe",
    "Anjana",
    "Soham Samal (guitar)",
    "Athul Bineesh (track)",
    "Jobin George (mix)",
  ],
  quoteFromChannel: "Lost in the rhythm, found in the music",
  /** Stated by Sanjeev (Nov 2026). Quote as written; don't add dates, rounds or rankings that aren't here. */
  achievements: [
    { when: "2015", title: "Finalist, Muscat Icon", place: "Muscat, Oman" },
    { when: "Class IX", title: "2nd place, inter-school music competition", place: "" },
    { when: "School", title: "2nd place, Jhankaar, an inter-school light music competition", place: "Muscat, Oman" },
    {
      when: "2021 to 2025",
      title: "Performed in shows alongside artists including Ayush Panda, Mrinmay MS and Prakriti Mishra, and with multiple bands",
      place: "NIT Rourkela",
    },
    {
      when: "2021 to 2025",
      title: "Won multiple performance events, both with the band and as a solo vocalist",
      place: "IIT Kharagpur and IIT Bhubaneswar",
    },
  ],
  /** From the public profile, Nov 2026. */
  instagram: {
    handle: "sanjeev_sudarsanam",
    name: "Sanjeev Sudarsanam",
    url: "https://www.instagram.com/sanjeev_sudarsanam/",
    followers: 1641,
    following: 1722,
    posts: 87,
    followersLabel: "1.6K+",
    bio: "Love Singing 🎶 DM for Collabs",
    bioLink: "https://youtu.be/maFfE8Klbz4",
    highlights: [
      { title: "COVERS", url: "https://www.instagram.com/stories/highlights/17948723135745968/" },
      { title: "Story Covers", url: "https://www.instagram.com/stories/highlights/18363909325058348/" },
      { title: "Song Requests", url: "https://www.instagram.com/stories/highlights/17946172090493199/" },
    ],
    note: "Short vocal covers as reels, regularly through 2026.",
    /**
     * Reels to show and play inline, newest first. Paste each reel's link (or just the code after /reel/).
     * Instagram doesn't let a site list them automatically.
     */
    reels: ["DepCQciBBbR", "DejPH-1NqEu", "Dcl8HUnNlOv", "DaHxb_CsoMS", "DZR1UY2tsQy", "DXZp7uZja8L"] as string[],
  },
} as const;

/** Things nobody should state as fact. The assistant must say it does not know. */
export const unknowns = [
  "Formal music training, teachers or grades",
  "Whether he plays any instrument (the instruments on this site are synthesised visual and sound design, not a claim)",
  "Details of the 2018 Guruvayur concert beyond the video title",
  "Competition details beyond those listed on this site (exact dates, rounds, judges, prizes)",
  "Original compositions or streaming releases (every titled upload is a cover)",
  "Competitive programming profiles, ratings or problem counts",
  "CGPA or board marks",
  "Internal Amdocs details: customers, architecture, code or internal names",
] as const;

export const sections = [
  { id: "intro", label: "Intro", beat: "I" },
  { id: "work", label: "Work", beat: "I" },
  { id: "projects", label: "Projects", beat: "I" },
  { id: "sa", label: "San-AI", beat: "I" },
  { id: "stack", label: "Stack", beat: "I" },
  { id: "algorithms", label: "Algorithms", beat: "O" },
  { id: "ragas", label: "Music Lab", beat: "O" },
  { id: "voice", label: "Voice", beat: "O" },
  { id: "backstage", label: "Backstage", beat: "O" },
  { id: "contact", label: "Contact", beat: "O" },
] as const;

export type SectionId = (typeof sections)[number]["id"];
