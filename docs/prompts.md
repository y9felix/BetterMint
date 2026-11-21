Below are the rewritten prompts in their recommended run order, followed by the rewritten `philosophy.md`. Each prompt uses generic references to "the project", edits workspace files directly for AI Studio App building, and fixes the runtime, entry point, and optimization gaps.

## Prompt order

Run them in this sequence: dead code removal, architectural review, bug audit, and performance optimization.

### Step 1, dead code removal

```markdown
Audit this entire project to identify and remove all dead, unused, and redundant code.

Before marking any file, export, style, or function as unused, map every project entry point. Check manifest or configuration files, HTML files and linked scripts or styles, dynamic module or script loading, CSS classes toggled from code, and string-keyed message, event, or command handlers. Verify across the whole repository that no file references an item statically, dynamically, or by string name.

Remove confirmed dead code, unused CSS rules, orphaned files, and redundant helpers directly in the project files. Preserve all existing behavior.

After editing, run any available build, typecheck, lint, or test commands to confirm nothing broke. Report what was removed, which checks ran, and what could not be verified at runtime.
```

### Step 2, architectural review

```markdown
The project works, but it probably contains choices that are less simple, minimal, and correct than other available choices. Inspect the entire project against `philosophy.md`, find those choices, and replace them with better ones.

Philosophy is a gradient, not a checklist. Do not ask only whether a choice satisfies a rule. Ask whether a more aligned choice exists for the same problem, and look for one actively.

Review the project top-down, since a high-level choice often removes several lower ones:

1. Scope: is everything the project does needed, or are there speculative features, options, or fallback shims to drop?
2. Data: are the state shapes, storage schemas, configuration maps, and cross-context payloads the right ones, and does the code follow from them?
3. Structure: are modules, background or worker logic, UI views, and shared helpers divided sensibly without extra layers or unnecessary dependencies?
4. Details: individual functions, error paths, and expressions.

For each decision you examine, state:
- what the current decision is;
- one or two concrete alternatives you considered;
- which option aligns better with `philosophy.md` and why;
- if the current choice stays, state that and give the reason.

"I looked and found nothing more aligned" is a valid and frequent outcome. Do not change code merely to change it, and do not add complexity under the label of improvement.

Rules for the changes:
- Edit the project files directly rather than printing the entire codebase in chat. Keep style consistent across all modified files.
- Preserve core intended behavior. Where you narrow scope by dropping an unused edge case, speculative option, or non-standard workaround, name the exact case dropped and explain why dropping it is better. Do not narrow scope by tolerating broken behavior.
- Judge only by `philosophy.md` and basic correctness. Do not invent extra principles.
- If two designs seem equally aligned, keep the existing one.

After applying edits, run available build, typecheck, or test checks. End with a short list of the decisions you changed, ordered by level and file path.
```

### Step 3, bug audit

```markdown
Inspect this entire project and conduct an exhaustive audit to find real bugs across the codebase.

First read project documentation, manifests, configuration, and entry points to establish intended behavior rather than assuming the current implementation is always right. Trace execution end-to-end across all files and runtime contexts: startup, background or worker lifecycles where in-memory state may reset, UI views, DOM timing and mutations, async storage or network calls, error handling, and cross-context message or event passing.

Check specifically for state loss across worker restarts, race conditions, unhandled promise rejections, Content Security Policy or permission mismatches, unchecked external or user input, off-by-one or edge-case logic errors, and divergence between configuration or documentation and actual code.

For every bug you discover:
1. Provide the exact file path and line numbers.
2. Explain why it is a bug with a concrete execution trace or reproduction steps.
3. Apply the minimal fix directly in the project files.

Include zero false positives and zero stylistic nitpicks. If you find no confirmed bugs in an area, state that plainly.

After applying fixes, run any available build, lint, typecheck, or test commands. State clearly which fixes were verified by running commands and which were verified by static inspection only.
```

### Step 4, performance optimization

```markdown
Analyze this entire project to identify and fix meaningful performance bottlenecks and resource waste while staying aligned with `philosophy.md`, especially section 6 against premature caching and section 4.6 on clarity.

Focus on concrete structural overhead across the project:
- startup cost, bundle size, and script-injection footprint;
- overly broad execution or match scopes;
- unthrottled DOM observers, scroll or input listeners, and repeated full-DOM rebuilds;
- repeated storage, network, or cross-context message calls inside loops;
- blocking synchronous work on the UI thread and retained listeners or memory leaks.

Do not apply micro-optimizations, replace readable array methods with manual loops, or add in-memory caches unless there is clear, significant overhead.

For each bottleneck you resolve:
1. Name the file path, the operation, and why it causes measurable overhead.
2. Apply the minimal change directly in the project files while preserving all existing behavior.

After editing, run available build, typecheck, or test commands to verify zero behavioral regressions, and summarize the changes made.
```

## Rewritten `philosophy.md`

```markdown
# Architecture philosophy

Companion specification governing design, architecture, and workflow for client-side web and browser projects.

## 1. The creed

1.1 **Simplicity, clarity, and frugality.** A project uses minimal network bandwidth, modest storage, shallow DOM trees, and low CPU overhead.

1.2 **Counter prevailing bloat.** Modern front-end tooling normalizes megabyte-scale bundles, multi-stage transpilation, and runtime frameworks for simple interfaces. This philosophy builds the opposite: lean, semantic markup and direct platform code.

1.3 **Respect client resources.** User devices are not free compute. Memory, battery life, and storage quotas are not traded away for developer convenience.

1.4 **Volume of code is debt.** Every kilobyte of script and stylesheet adds parsing, execution, and maintenance cost. Shrinking code size and DOM depth is progress.

1.5 **Do not patch complexity; rewrite it.** Complex state managers and tangled component trees should be scrapped and replaced with simpler declarative markup, standard browser APIs, and flat state flow.

## 2. Order of qualities

2.1 **Ranking when qualities conflict:**
1. **Simplicity** of implementation first.
2. **Correctness** within reduced scope.
3. **Consistency** with standard web and runtime conventions.
4. **Completeness**, the first quality to drop.

2.2 **Implementation simplicity outranks interface magic.** If a feature requires a virtual DOM, reactive store framework, or heavy client bundler, replace it with standard DOM APIs, native events, and direct platform calls. Where the runtime requires a background worker, keep it stateless and minimal.

2.3 **Correctness by shrinking scope.** Never paper over rare edge cases with fragile shims or fallback layers. If a niche interaction requires disproportionate scripting, omit the feature.

2.4 **Deliver the core first.** Build semantic, accessible HTML and essential logic first. Keep extra visual enhancements minimal and decoupled from core behavior.

## 3. Structure

3.1 **Modularity.** Separate background or core logic, UI views, and page-level scripts cleanly. Keep modules decoupled without leaky global state.

3.2 **Composition.** Use standard browser APIs, plain JSON, and native event or message passing. Avoid custom RPC wrappers or bloated abstraction layers when direct platform calls suffice.

3.3 **Separation of mechanism and policy.** Core handlers and storage modules provide primitive data operations; UI views and configuration control presentation and rules. Never execute untrusted external or page-supplied strings as code.

3.4 **Parsimony.** Avoid unnecessary build pipelines, multi-package monorepos, and deep folder hierarchies. Keep the project structure flat and directly runnable where the runtime allows.

## 4. Behaviour at the interface

4.1 **Least surprise.** Respect native browser behavior and host pages. Never hijack scrolling, disable native text selection, break history navigation, or leak styles and globals into host environments.

4.2 **Silence.** Stored payloads, messages, logs, and UI outputs stay uncluttered. Store and pass only needed fields without arbitrary wrapper objects.

4.3 **Failure.** Fail explicitly with clear errors or rejected promises. Validate user, storage, and cross-context inputs strictly at the boundary; never silently swallow errors or process malformed payloads.

4.4 **Robustness.** Rely on native DOM and platform resilience. Missing optional DOM elements or failed enhancements must never block core functionality.

4.5 **Transparency.** Source code, DOM structures, network requests, and stored state must be directly legible in browser developer tools without mandatory source maps or obfuscation.

4.6 **Clarity over cleverness.** Code explains itself through plain naming, standard Web APIs, and shallow control flow. Omit redundant comments that restate what code does; write brief comments only to explain non-obvious platform quirks, worker lifecycle limits, or why a workaround exists.

## 5. Data before code

5.1 **Data dominates.** Design storage schemas, configuration shapes, and message payloads before writing handlers or UI views. Clean data structures make control flow trivial.

5.2 **Few structures.** Rely on native JavaScript objects, arrays, maps, sets, and JSON-serializable values. Avoid deep class hierarchies and state-wrapper libraries.

5.3 **Simple algorithms.** Avoid scanning, cloning, or rewriting large collections on every event. Filter early, index by key where needed, and batch storage reads and writes.

5.4 **Fold knowledge into data.** Use declarative manifests, static lookup tables, and command or route maps rather than sprawling procedural switch or conditional chains.

## 6. Measure before tuning

6.1 **Measure real cost.** Measure startup time, script-injection footprint, memory usage, and UI latency on real workloads before optimizing.

6.2 **No premature caching.** Do not add custom in-memory caches, memoization layers, or state sync mirrors without clear evidence that storage or DOM operations are the bottleneck.

## 7. Build only what is needed

7.1 **Implement only for today's requirements.** Never write speculative abstractions, configurable plugin engines, or unused settings ahead of real demand.

7.2 **Delete dead code.** Ruthlessly remove unused CSS rules, unreferenced handlers, dead branches, and orphaned files.

7.3 **No speculative generality.** Build single-purpose handlers and views rather than universal meta-APIs.

## 8. Platform and dependencies

8.1 **The platform is the standard Web stack.** Rely on modern ECMAScript, semantic HTML5, modern CSS, and built-in browser and runtime APIs rather than external packages.

8.2 **Default dependency budget is zero.** No runtime npm dependencies, no CSS frameworks, and no client-side UI frameworks. Any external dependency requires clear justification.

8.3 **Avoid, copy, or wrap.** If a small utility is needed, write a short self-contained function rather than pulling in a package tree.

8.4 **Isolate untrusted input.** Never pass untrusted strings to HTML injection sinks; use safe text nodes and explicit DOM construction. Enforce strict Content Security Policy, minimal requested permissions, and origin or sender validation on cross-context messages.

## 9. Working method

9.1 **Prototype markup and data flow first.** Build static views and verify data shapes before wiring persistence or edge cases.

9.2 **Delete.** Removing unnecessary scripts, permissions, dependencies, and markup is the highest-value optimization.

9.3 **Test cheaply.** Verify builds, static checks, and core flows with lightweight scripts or direct checks in the target browser instead of heavy automation suites unless complexity demands them.
```
