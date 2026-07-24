# AMT — Automated Test Cases

Derived from the current Playwright suite (`tests/*.spec.js`). Each case reflects exactly what the automation drives — steps and expected results match the page-object methods, so this document stays a source of truth for what's actually covered.

---

## TC-01 — Login (`tests/01-login.spec.js`)

| ID | Title | Steps | Expected Result |
|----|-------|-------|------------------|
| TC-01.1 | Login with empty email and password | 1. Go to `/login`.<br>2. Leave email and password fields empty.<br>3. Click **Login**. | Login is rejected; user remains on the login page. |
| TC-01.2 | Login with invalid credentials | 1. Go to `/login`.<br>2. Enter an invalid email (`wrong@test.com`) and password (`WrongPassword`).<br>3. Click **Login**. | Login is rejected; user remains on the login page. |
| TC-01.3 | Login with valid credentials | 1. Go to `/login`.<br>2. Enter a valid, registered email and password.<br>3. Click **Login**. | User is authenticated and navigated away from `/login`. |

---

## TC-02 — Funnel, Idea & Kanban (`tests/02-createFunnel.spec.js`)

| ID | Title | Steps | Expected Result |
|----|-------|-------|------------------|
| TC-02.1 | Create a new idea funnel | 1. Open **Tools → Funnels**.<br>2. Click **Create idea funnel**.<br>3. Enter a unique funnel name.<br>4. Click **Save**.<br>5. Click **View Ideas**. | Funnel is created and saved server-side; app navigates to the funnel's Kanban view (`/studio/funnels/{id}?view=kanban`). |
| TC-02.2 | Create an idea inside the funnel | 1. Click **Add idea**.<br>2. Choose **Enter manually** (if prompted).<br>3. Enter a title and description.<br>4. Close the dialog. | Idea is created with the given title and description. |
| TC-02.3 | Complete full idea detail flow | For the created idea, fill in sequentially:<br>1. Details (department, notes)<br>2. Work (add a task with phase, date, description)<br>3. Canvas (publish with filename + status message)<br>4. Problems (name, impacted user, statement, evidence)<br>5. Assumptions<br>6. Experiments (hypothesis, method, success metric, outcome, decision, notes)<br>7. Risks (title, mitigation, notes)<br>8. Decisions (title, description, rationale, alternatives, notes)<br>9. Lessons (title, summary, learnings, context, what worked/didn't, recommendation)<br>10. Comments (internal + portal)<br>11. Team member (add one via user picker)<br>12. Link (title + URL), set status to **Submitted**, **Follow**, **Like** | Every section saves without error; each sub-entity (problem, assumption, experiment, risk, decision, lesson, comment, team member, link) is persisted and the idea's status/follow/like state updates. |
| TC-02.4 | Move idea through Kanban stages | Drag the created idea card through lanes: **Review idea → Create proposal → Approved proposal → Denied proposal**. | The idea card moves to and is visible in each lane in sequence. |

---

## TC-03 — Project (`tests/03-createProject.spec.js`)

| ID | Title | Steps | Expected Result |
|----|-------|-------|------------------|
| TC-03.1 | Create a new project | 1. Open **Projects → Add project**.<br>2. Enter a unique title and description. | Project is created with the given title/description. |
| TC-03.2 | Add and toggle a tag | 1. Enter a new tag name in the tag input, confirm no suggestions exist, click **Create \<tag\>**.<br>2. From **Suggested tags**, select the first suggested tag, then remove it. | Tag is created and attached; suggested tag can be added and removed without error. |
| TC-03.3 | Complete full project detail flow | Same section coverage as TC-02.3 (Details, Task, Canvas, Problem, Assumption, Experiment, Risk, Decision, Lesson, Comment) plus: | Every section saves without error, matching Idea-level detail coverage. |
| TC-03.4 | View Activities tab | Click the **Activities** tab. | *(Known issue — see Notes below: currently returns 404.)* |
| TC-03.5 | Open created project from list | Click the project's title link from the projects list. | Project detail page opens for the correct project. |

---

## TC-04 — Automation Rules (`tests/04-automation.spec.js`)

| ID | Title | Steps | Expected Result |
|----|-------|-------|------------------|
| TC-04.1 | Create a dedicated funnel for the rule | Create a fresh funnel (isolated, to avoid routing conflicts with existing active rules). | Funnel created; its display name captured for later steps. |
| TC-04.2 | Navigate to Automations | Go to **Settings → Automation → Automations**. | Automations list page loads. |
| TC-04.3 | Create and configure an automation rule | 1. Click **Add rule**, name it, enable it.<br>2. Set trigger funnel = the dedicated funnel from TC-04.1.<br>3. Set condition: Department = General.<br>4. Set action: move to a target lane.<br>5. Save. | Rule is created, scoped to the correct funnel, and saved with the configured condition/action. |
| TC-04.4 | Search and toggle rule status | 1. Search rules by name.<br>2. Toggle the rule's enabled/disabled switch. | Rule's status toggles as expected. |
| TC-04.5 | Create an idea in the scoped funnel | Switch to the dedicated funnel (if not already active) and create a new idea, setting its Department and Funnel fields to match the rule's scope. | Idea is created inside the correct funnel. |
| TC-04.6 | Verify rule triggers on idea update | Update the idea's title and confirm the automation rule reacts (per its configured condition/action). | Idea title updates; automation rule fires per its configured condition. |

---

## TC-05 — Branding (`tests/05-branding.spec.js`)

| ID | Title | Steps | Expected Result |
|----|-------|-------|------------------|
| TC-05.1 | Apply company branding | 1. Go to **Settings → Branding**.<br>2. Upload a logo image and crop/save.<br>3. Upload a square logo image and crop/save.<br>4. Set brand color via hex input.<br>5. Click **Save**. | "Branding updated." confirmation toast appears; changes are saved. |
| TC-05.2 | Reset discards unsaved changes | 1. Go to Branding.<br>2. Record current brand color.<br>3. Change the color (without saving).<br>4. Click **Reset**. | Color reverts to the value recorded before the edit — i.e., the unsaved change is discarded, not persisted. |

---

## TC-06 — Tasks (`tests/06-tasks.spec.js`)

| ID | Title | Steps | Expected Result |
|----|-------|-------|------------------|
| TC-06.1 | Create a task with full field set | 1. Open **Tasks → Add task**.<br>2. Enter title and phase.<br>3. Set due date and start date.<br>4. Set status = Completed.<br>5. Set estimated time (2h 30m) and spent time (1h 45m).<br>6. Enter a description.<br>7. Save. | Task is created and persisted with all field values. |
| TC-06.2 | Reopen task and verify saved values | 1. Enable "Show completed tasks" (task is Completed, hidden by default).<br>2. Search for the task by title.<br>3. Open it. | Title, phase, estimated/spent hours & minutes, and description all match what was saved in TC-06.1. |
| TC-06.3 | Toggle "Show completed tasks" | Toggle the switch and read its checked state before/after. | Checked state flips (before ≠ after). |
| TC-06.4 | Quick-add a task | Type a title into the inline "New task" row and press Enter. | Task row appears immediately in the list. |
| TC-06.5 | Delete a task | Open a task (quick-added and the original) and click **Delete**, confirming the browser dialog. | Task row is removed from the list. |

---

## Notes / Known Gaps

- **TC-03.4 (Activities tab)** is currently a documented failure, not a false negative — the app returns a 404 on this tab. The test logs this and continues rather than hard-failing the whole run.
- **Duplicated coverage**: `IdeaPage` and `ProjectPage` share nearly identical sub-flows (Problems, Assumptions, Experiments, Risks, Decisions, Lessons), so TC-02.3 and TC-03.3 exercise the same underlying UI patterns on two different entities.
- **Environment dependency**: all cases except TC-01 rely on the authenticated session produced once in `global-setup.js` — if login fails there, every case in TC-02–TC-06 fails with a misleading "element not found" error rather than an auth error.
- **No negative/edge-case coverage** currently exists for: automation rule conflicts ("Blocked" status), task time-validation (e.g. non-multiple-of-5 minutes, enforced only in the helper code, not exercised via UI), or branding image upload failures (wrong file type/size).
