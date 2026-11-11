/** Who JobAI is hunting for. Facts come from the portfolio's profile, so there is one source of truth. */
import { education, flagship, identity, leadership, music, projects, stack, work } from "../src/content/profile";

export const TARGET_ROLES = [
  "Backend engineer (Java, Spring Boot, microservices)",
  "Software engineer / Software developer / SDE",
  "Full-stack engineer (TypeScript, React, Node, MERN)",
  "SDET / QA automation engineer (Cypress, Playwright)",
  "AI software engineer / developer (LLM apps, applied AI)",
  "DevOps / platform engineer",
];

/** Search phrases for aggregator APIs (Adzuna, Jooble). */
export const QUERIES = ["java backend developer", "spring boot developer", "software engineer", "full stack developer typescript", "sdet playwright", "ai engineer", "devops engineer"];

export const CANDIDATE = {
  name: identity.name,
  email: identity.email,
  location: identity.location,
  experience: "About 1.5 years full-time (Software Developer at Amdocs since June 2025) plus a 2024 software internship.",
  openTo: "Worldwide: India (preferred), remote, and international roles that sponsor visas.",
  seniority: "Entry to mid level (0–3 years). Not senior, staff, principal, lead or manager roles.",
};

/** A compact, truthful fact sheet. Claude may only use these facts when judging fit or tailoring the resume. */
export function factSheet() {
  return [
    `${identity.name}. ${identity.bio}`,
    `Flagship result: cut critical API response times at Amdocs from ${flagship.beforeSeconds}+ seconds to under ${flagship.afterSeconds} second by profiling bottlenecks, redesigning caching, tuning TTLs and reworking scheduler logic.`,
    ...work.map((w) => `ROLE ${w.title} at ${w.company}, ${w.place} (${w.start} to ${w.end}). ${w.summary}\n- ${w.bullets.join("\n- ")}\nStack: ${w.stack.join(", ")}`),
    ...projects.map((p) => `PROJECT ${p.title} (${p.status}, ${p.period ?? ""}): ${p.oneLiner} ${p.details.join(" ")} Stack: ${p.stack.join(", ")}`),
    `SKILLS headliners: ${stack.headliners.join(", ")}. Also: ${[...stack.mainStage, ...stack.secondStage].join(", ")}. Craft: ${stack.craft.join(", ")}. Tools: ${stack.smallPrint.join(", ")}.`,
    ...education.map((e) => `EDUCATION ${e.programme}, ${e.school} (${e.period}). ${e.detail}`),
    ...leadership.map((l) => `LEADERSHIP ${l.role}, ${l.org} (${l.period}). ${l.detail}`),
    `MUSIC (extracurricular): ${music.achievements.map((a) => a.title).join("; ")}.`,
  ].join("\n");
}
