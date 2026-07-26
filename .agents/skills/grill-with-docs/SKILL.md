---
name: grill-with-docs
description: Conduct a rigorous, documentation-aware interview for Etsy Listing Studio plans and designs. Use only when the user explicitly invokes $grill-with-docs to stress-test product, domain, workflow, data-contract, or architecture decisions, capture confirmed decisions in canonical project docs, and stop before implementation.
---

# Grill with Docs

Run a decision-focused design session for Etsy Listing Studio. Allow documentation changes during the session, but never implement the resulting plan.

## Ground the Session

Before asking the first question:

1. Read `.agents/AGENTS.md` and `docs/BUILD_BRIEF.md`.
2. Read `CONTEXT.md`, existing files under `docs/adr/`, and relevant code or contracts when present.
3. Explore the filesystem and available tools to resolve facts. Do not ask the user for information that can be discovered.
4. Separate facts from decisions. Surface contradictions between the user's description, project documentation, and implementation evidence.

Respect the active execution mode and safety constraints. If documentation writes are not allowed, retain proposed updates for the final recap instead of editing files.

## Conduct the Interview

- Build a decision tree and resolve prerequisite decisions before dependent ones.
- Ask exactly one decision question per turn and wait for the answer.
- Include a recommended answer and a brief rationale with every question.
- Offer meaningful alternatives and tradeoffs when more than one answer is viable.
- Challenge vague or overloaded terminology and propose one precise canonical term.
- Use concrete scenarios to probe boundaries, unhappy paths, partial success, retries, cancellation, recovery, and user control.
- Cover only relevant branches, including goals, success criteria, scope, user workflow, domain concepts, data contracts, failure behavior, validation, and acceptance criteria.
- Do not treat a recommendation, inference, or tentative answer as the user's decision.

## Record Confirmed Decisions

Write a decision only after the user clearly confirms it. If the answer is ambiguous or conflicts with existing material, resolve the conflict first. Capture each decision in one canonical location and link to it rather than duplicating it.

### `docs/BUILD_BRIEF.md`

Record confirmed product direction, scope, user experience, workflow, behavioral requirements, and milestone changes. Update the existing relevant section instead of appending a parallel specification.

### `CONTEXT.md`

Create this file lazily after the first confirmed domain term. Keep it an implementation-free glossary containing only project-specific language:

```md
# Etsy Listing Studio

{One or two sentences describing the domain.}

## Language

**Canonical term**:
{A one- or two-sentence definition.}
_Avoid_: {ambiguous synonyms}
```

Choose one term when synonyms compete. Define what the concept is, not how code implements it.

### `docs/adr/`

Create this directory and an ADR only when the decision is:

1. hard or costly to reverse;
2. surprising without its context; and
3. the result of a genuine tradeoff.

Require all three conditions. Number ADRs sequentially as `NNNN-short-slug.md` and keep the default form concise:

```md
# {Decision title}

{What was decided, the relevant context, and why this option won.}
```

### `.agents/AGENTS.md`

Record only durable instructions future agents must follow, such as architectural constraints, canonical commands, repository workflows, or recurring verification requirements. Keep temporary preferences, discussion notes, and detailed specifications elsewhere.

## Enforce the Boundary

- Treat documentation edits as the only permitted repository mutation during the session.
- Do not implement application code, schemas, configuration, migrations, tests, generated assets, or the resulting plan.
- Do not create `CONTEXT.md` or an ADR speculatively.
- Do not continue into implementation after the interview, even when all decisions are resolved.

## Complete the Session

Continue until the important decision branches are resolved or explicitly deferred. Then provide:

1. confirmed decisions;
2. documentation changed, or proposed changes when writes were unavailable;
3. deferred decisions and remaining risks; and
4. a decision-complete implementation handoff.

Ask the user to confirm that the recap reflects the shared understanding. After confirmation, stop and wait for a separate implementation request.

## Attribution

Adapted from Matt Pocock's `grill-with-docs`, `grilling`, and `domain-modeling` skills in [mattpocock/skills](https://github.com/mattpocock/skills), used under the MIT License. See `LICENSE`.
