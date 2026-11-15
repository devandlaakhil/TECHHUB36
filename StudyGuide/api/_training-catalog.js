"use strict";

const { COURSES, coachForCategory } = require("../learning-catalog");

const DETAILS = {
  "C# / .NET": ["C#", "Language fundamentals, OOP, async, runtime behavior and practical backend decisions."],
  "ASP.NET Core": [".NET", "Request pipelines, dependency injection, API design and production-ready services."],
  "EF Core": ["EF Core & LINQ", "Queries, tracking, relationships, migrations and data-access trade-offs."],
  "LINQ": ["EF Core & LINQ", "Query composition, deferred execution, projections and efficient materialization."],
  "Angular": ["Angular", "Components, forms, routing, state and maintainable frontend applications."],
  "JavaScript / TypeScript": ["JavaScript / TypeScript", "Language behavior, types, asynchronous code and browser-side problem solving."],
  "Azure": ["Azure", "Cloud services, identity, messaging, deployment and operational decisions."],
  "DevOps": ["DevOps", "Git, CI/CD, containers, infrastructure and production delivery workflows."],
  "SQL": ["SQL", "Queries, joins, indexes, transactions and database performance reasoning."],
  "System Design": ["System Design", "Requirements, service boundaries, scalability, reliability and design trade-offs."],
  "REST APIs": [".NET", "HTTP contracts, validation, authentication, versioning and resilient API behavior."],
  "Microservices": ["Microservices", "Service boundaries, communication, consistency and distributed-system patterns."],
  "Identity & Security": ["Identity & Security", "Authentication, authorization, tokens and secure application boundaries."],
  "Testing": ["Testing", "Unit and integration testing, test design, mocks and dependable regression checks."],
  "Data Structures & Algorithms": ["DSA", "Problem-solving patterns, complexity, data structures and clear code explanations."],
  "Behavioral": [null, "Truthful project stories, structured answers, teamwork and technical communication."],
};

function escape(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function trainingTopics() {
  return COURSES.filter(course => course.kind === "Interview Q&A").map(course => {
    const [category, description] = DETAILS[course.topic] || [null, course.description];
    return {
      ...course, description, coach: coachForCategory(course.category),
      learnHref: category ? `Concepts.html?${new URLSearchParams({ category })}` : "Interview-Preparation.html#experience-qa",
    };
  });
}

function renderTrainingDirectory(mode) {
  const coaching = mode === "coaching";
  const topics = trainingTopics();
  const prefix = coaching ? "coaching" : "training";
  const categories = [...new Set(topics.map(topic => topic.category))];
  return `<div class="training-filters" data-training-filters hidden>
    <label for="${prefix}-search">Find your topic<input id="${prefix}-search" data-training-search type="search" maxlength="160" placeholder="Search a topic, mentor or skill"></label>
    <label for="${prefix}-category">Category<select id="${prefix}-category" data-training-category><option value="">All topics</option>${categories.map(category =>
      `<option value="${escape(category)}">${escape(category)}</option>`).join("")}</select></label>
    <button class="button secondary" type="button" data-training-reset>Clear filters</button>
  </div>
  <p class="muted" data-training-status role="status" aria-live="polite">${topics.length} topics${coaching ? ". Enquire before booking; availability is confirmed privately." : ", matching the Interview Q&A directory."}</p>
  <div class="${coaching ? "training-grid" : "home-topic-grid"}">${topics.map(topic =>
    `<article class="${coaching ? "training-card" : "home-topic-card"}" data-training-topic="${escape(topic.topic)}" data-training-category-name="${escape(topic.category)}" data-training-coach="${topic.coach}">
      <div class="training-card-top"><span class="training-category">${escape(topic.category)}</span>${coaching ? '<span class="training-format">1:1 guidance</span>' : ""}</div>
      <h3>${escape(topic.topic)}</h3><p>${escape(topic.description)}</p>
      <div class="training-mentor"><span class="training-avatar" aria-hidden="true">${topic.coach[0]}</span><span>${coaching ? "Your mentor" : "Topic guidance"}<strong>${topic.coach}</strong></span></div>
      ${coaching ? `<p class="training-availability">Schedule, duration and any fees are confirmed before booking.</p><a class="button" href="https://wa.me/918985837483?${new URLSearchParams({
        text: `Hello KR7Tech admin, I would like to enquire about 1:1 ${topic.topic} coaching with ${topic.coach}. Please share availability, session details and any fees before I book.`,
      })}" target="_blank" rel="noopener noreferrer">Enquire about ${escape(topic.topic)}</a>
      <a class="training-secondary" href="/${escape(topic.href)}">Preview interview questions &rarr;</a>` :
      `<a href="/${escape(topic.learnHref)}">${DETAILS[topic.topic]?.[0] ? "Learn concepts" : "Preparation guide"} &rarr;</a>
      <a href="/${escape(topic.href)}">Interview Q&amp;A &rarr;</a>
      <a href="/Coaching.html?${escape(new URLSearchParams({ topic: topic.topic }))}#coaching-topics">1:1 coaching with ${topic.coach} &rarr;</a>`}
    </article>`).join("")}</div>
    <p data-training-empty hidden>No topics match. Try another subject, mentor or category.</p>`;
}

module.exports = { trainingTopics, renderTrainingDirectory };
