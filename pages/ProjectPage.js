import { generateRandomName } from '../utils/helper.js';

export class ProjectPage {
  constructor(page) {
    this.page = page;

    // Loading overlay
    this.loadingOverlay = page.locator('div.absolute.inset-0.z-20');

    // Navigation
    this.projectsButton = page.getByRole('button', { name: 'Projects' });
    this.addProjectButton = page.getByRole('button', { name: 'Add project' });

    // Project title / description
    this.projectTitleInput = page.getByRole('textbox', { name: 'Title' });
    this.projectDescriptionBox = page.getByRole('dialog', { name: 'Edit title & description' }).locator('iframe[title="Rich Text Area"]').contentFrame().getByLabel('Rich Text Area. Press ALT-0');

    // Tags
    this.tagInput = page.getByRole('textbox', { name: 'Tag input' });
    this.noSuggestions = page.getByText('No suggestions');
    this.createTagButton = (tagName) => page.getByRole('button', { name: `Create ${tagName}` });

    // Team
    this.acceptMissionButton = page.getByRole('button', { name: 'Accept Mission' });
    this.removeAcceptMissionButton = page.getByRole('button', { name: 'Remove Accept Mission' });
    this.closeButton = page.getByRole('button', { name: 'Close' });

    // Details
    this.detailsTab = page.getByRole('tab', { name: 'Details' });
    this.detailsNote = page.getByRole('tabpanel', { name: 'Details' }).locator('iframe[title="Rich Text Area"]').contentFrame().getByLabel('Rich Text Area. Press ALT-0');
    this.departmentButton = page.getByRole('button', { name: 'Select department' });
    this.generalDepartment = page.getByRole('button', { name: /General/ });

    // Work / Tasks
    this.workTab = page.getByRole('tab', { name: 'Work' });
    this.addTaskBtn = page.getByRole('button', { name: 'Add task' });
    this.taskTitle = page.getByRole('textbox', { name: 'Title' });
    this.taskPhase = page.getByRole('textbox', { name: 'Phase' });
    this.taskDescription = page.getByRole('dialog', { name: '✔️ Add task' }).locator('iframe[title="Rich Text Area"]').contentFrame().getByLabel('Rich Text Area. Press ALT-0');

    // Canvas
    this.canvasButton = page.getByRole('button', { name: 'Canvases' });
    this.publishButton = page.getByRole('button', { name: 'Publish' });
    this.filenameTextbox = page.getByRole('textbox', { name: 'Filename' });
    this.msgBox = page.getByRole('textbox', { name: 'Status message' });

    // Problems
    this.problemsButton = page.getByRole('button', { name: 'Problems' });
    this.addProblemButton = page.locator('button').filter({ hasText: /^Add problem$/ });
    this.problemTextbox = page.getByRole('textbox', { name: 'Short problem name' });
    this.problemUser = page.getByRole('textbox', { name: 'Who is impacted?' });
    this.problemStatement = page.getByRole('textbox', { name: 'What is happening, for who,' });
    this.problemEvidence = page.getByRole('textbox', { name: 'Metrics, quotes, incidents' });
    this.addProblemSubmitButton = page.getByRole('button', { name: 'Add problem' });

    // Assumptions
    this.assumptionsButton = page.getByRole('button', { name: 'Assumptions' });
    this.addAssumptionButton = page.locator('button').filter({ hasText: /^Add assumption$/ });
    this.assumptionTextbox = page.getByRole('textbox', { name: 'Write the assumption as a' });
    this.addAssumptionSubmitButton = page.getByRole('button', { name: 'Add assumption' });

    // Experiments
    this.experimentsButton = page.getByRole('button', { name: 'Experiments' });
    this.addExperimentButton = page.getByRole('button', { name: 'Add Experiment', exact: true });
    this.experimentTitle = page.getByRole('textbox', { name: 'Example: Validate onboarding' });
    this.addExperimentSubmitButton = page.getByRole('button', { name: 'Add experiment' });
    this.hypothesis = page.locator('div').filter({ hasText: /^Hypothesis/ }).locator('textarea').first();
    this.method = page.locator('div').filter({ hasText: /^Method/ }).locator('textarea').first();
    this.successMetric = page.locator('div').filter({ hasText: /^Success metric/ }).locator('textarea').first();
    this.outcomeSummary = page.locator('div').filter({ hasText: /^Outcome summary/ }).locator('textarea').first();
    this.exDecision = page.locator('div').filter({ hasText: /^Decision/ }).locator('textarea').first();
    this.exNotes = page.locator('div').filter({ hasText: /^Notes/ }).locator('textarea').first();

    // Risks
    this.risksButton = page.getByRole('button', { name: 'Risks' });
    this.addRiskButton = page.locator('button').filter({ hasText: /^Add risk$/ });
    this.riskTitle = page.getByRole('textbox').first();
    this.riskMitigation = page.getByRole('textbox', { name: 'Describe the mitigation' });
    this.notesField = page.getByRole('textbox', { name: 'Add context or follow ups' });
    this.addRiskSubmitButton = page.getByRole('button', { name: 'Add risk' });

    // Decisions
    this.decisionsButton = page.getByRole('button', { name: 'Decisions' });
    this.addDecisionButton = page.locator('button').filter({ hasText: /^Add decision$/ });
    this.addDecisionTitle = page.getByRole('textbox', { name: 'Decision title' });
    this.addDecisionDescription = page.getByRole('textbox', { name: 'What was decided' });
    this.addDecisionRationale = page.getByRole('textbox', { name: 'Why this was the right' });
    this.addDecisionAlternatives = page.getByRole('textbox', { name: 'Alternatives considered' });
    this.addDecisionNotes = page.getByRole('textbox', { name: 'Next steps' });
    this.updateDecisionBtn = page.getByRole('button', { name: 'Update decision' });

    // Lessons
    this.lessonsButton = page.getByRole('button', { name: 'Lessons' });
    this.addLessonButton = page.locator('button').filter({ hasText: /^Add lesson$/ });
    this.addLessonTitle = page.getByRole('textbox', { name: 'Lesson title' });
    this.addLessonSummary = page.getByRole('textbox', { name: 'Short summary' });
    this.addLessonLearn = page.getByRole('textbox', { name: 'What did we learn' });
    this.addLessonContext = page.getByRole('textbox', { name: 'Where did this happen' });
    this.addLessonWorked = page.getByRole('textbox', { name: 'What worked well' });
    this.addLessonNotWorked = page.getByRole('textbox', { name: 'What did not work' });
    this.addLessonRecommend = page.getByRole('textbox', { name: 'What should others do' });
    this.updateLessonBtn = page.getByRole('button', { name: 'Update lesson' });

    // Comments / Activities
    this.commentsTab = page.getByRole('tab', { name: 'Comments' });
    this.internalTeamButton = page.getByRole('button', { name: 'Internal Team' });
    this.portalButton = page.getByRole('button', { name: 'Portal' });
    this.commentBox = page.getByRole('textbox', { name: 'Write your comment...' });
    this.submitCommentButton = page.getByRole('button', { name: 'Submit' });
    this.activitiesTab = page.getByRole('tab', { name: 'Activities' });
  }

  //createProject
  async createProject() {
    const projectTitle = generateRandomName('Project');

    await this.projectsButton.click();
    await this.addProjectButton.click();

    await this.projectTitleInput.click();
    await this.projectTitleInput.fill(projectTitle);

    await this.projectDescriptionBox.click();
    await this.projectDescriptionBox.fill(generateRandomName('ProjectDes'));

    console.log('✅ Project has been created successfully...');

    return { projectTitle, projectUrl: this.page.url() };
  }

  //addTag
  async addTag() {
    const tagName = generateRandomName('Tag');

    await this.tagInput.click();
    await this.tagInput.fill(tagName);
    await this.noSuggestions.click();

    await this.createTagButton(tagName).click();

    console.log('✅ Tag has been added successfully...');
  }

  //toggleTeam
  async toggleTeam() {
    await this.acceptMissionButton.click();
    await this.removeAcceptMissionButton.click();
    await this.closeButton.click();

    console.log('✅ Team selection has been toggled successfully...');
  }

  //fillDetailsSection
  async fillDetailsSection() {
    const detailsNote = generateRandomName('Note');

    await this.detailsTab.click();

    await this.departmentButton.click();
    await this.generalDepartment.click();

    await this.detailsNote.click();
    await this.detailsNote.fill(detailsNote);

    console.log('✅ Details section has been filled successfully...');
  }

  //addTask
  async addTask() {
    const taskTitle = generateRandomName('Task');
    const taskPhase = generateRandomName('Phase');
    const taskDescription = generateRandomName('Description');

    await this.workTab.click();

    await this.addTaskBtn.first().click();

    await this.taskTitle.fill(taskTitle);
    await this.taskPhase.fill(taskPhase);
    await this.taskDescription.fill(taskDescription);

    await this.addTaskBtn.click();

    console.log('✅ Task has been added successfully...');
  }

  //publishCanvas
  async publishCanvas() {
    const canvasFilename = generateRandomName('Canvas');
    const canvasMessage = generateRandomName('Message');

    await this.canvasButton.click();

    await this.publishButton.waitFor({ state: 'visible' });
    await this.publishButton.click();

    await this.filenameTextbox.waitFor({ state: 'visible' });
    await this.filenameTextbox.fill(canvasFilename);
    await this.msgBox.fill(canvasMessage);

    await this.publishButton.click();
    await this.filenameTextbox.waitFor({ state: 'hidden', timeout: 30000 });

    console.log('✅ Canvas has been published successfully...');
  }

  //addProblem
  async addProblem() {
    const problemName = generateRandomName('Problem');
    const problemUser = generateRandomName('User');
    const problemStatement = generateRandomName('Statement');
    const problemEvidence = generateRandomName('Evidence');

    await this.problemsButton.click();

    await this.addProblemButton.click();

    await this.problemTextbox.waitFor({ state: 'visible' });
    await this.problemTextbox.fill(problemName);

    await this.problemUser.fill(problemUser);
    await this.problemStatement.fill(problemStatement);
    await this.problemEvidence.fill(problemEvidence);

    await this.addProblemSubmitButton.waitFor({ state: 'visible', timeout: 30000 });
    await this.loadingOverlay.waitFor({ state: 'hidden' }).catch(() => {});
    await this.addProblemSubmitButton.click();

    console.log('✅ Problem has been added successfully...');
  }

  //addAssumption
  async addAssumption() {
    const assumption = generateRandomName('Assumption');

    await this.assumptionsButton.click();

    await this.addAssumptionButton.click();

    await this.assumptionTextbox.waitFor({ state: 'visible' });
    await this.assumptionTextbox.fill(assumption);

    await this.addAssumptionSubmitButton.waitFor({ state: 'visible', timeout: 30000 });
    await this.loadingOverlay.waitFor({ state: 'hidden' }).catch(() => {});
    await this.addAssumptionSubmitButton.click();

    console.log('✅ Assumption has been added successfully...');
  }

  //addExperiment
  async addExperiment() {
    const experimentTitle = generateRandomName('Experiment');
    const hypothesis = generateRandomName('Hypothesis');
    const method = generateRandomName('Method');
    const successMetric = generateRandomName('Metric');
    const outcomeSummary = generateRandomName('Outcome');
    const decision = generateRandomName('Decision');
    const notes = generateRandomName('Notes');

    await this.experimentsButton.click();

    await this.addExperimentButton.click();

    await this.experimentTitle.waitFor({ state: 'visible' });
    await this.experimentTitle.fill(experimentTitle);

    await this.hypothesis.fill(hypothesis);
    await this.method.fill(method);
    await this.successMetric.fill(successMetric);
    await this.outcomeSummary.fill(outcomeSummary);
    await this.exDecision.fill(decision);
    await this.exNotes.fill(notes);

    await this.addExperimentSubmitButton.waitFor({ state: 'visible', timeout: 30000 });
    await this.loadingOverlay.waitFor({ state: 'hidden' }).catch(() => {});
    await this.addExperimentSubmitButton.click();

    console.log('✅ Experiment has been added successfully...');
  }

  //addRisk
  async addRisk() {
    const riskTitle = generateRandomName('Risk');
    const riskMitigation = generateRandomName('Mitigation');
    const riskNotes = generateRandomName('Notes');

    await this.risksButton.click();

    await this.addRiskButton.click();

    await this.riskTitle.waitFor({ state: 'visible' });
    await this.riskTitle.fill(riskTitle);

    await this.riskMitigation.fill(riskMitigation);
    await this.notesField.waitFor({ state: 'visible', timeout: 10000 });
    await this.notesField.fill(riskNotes);

    await this.addRiskSubmitButton.waitFor({ state: 'visible', timeout: 30000 });
    await this.loadingOverlay.waitFor({ state: 'hidden' }).catch(() => {});
    await this.addRiskSubmitButton.click();

    console.log('✅ Risk has been added successfully...');
  }

  //addDecision
  async addDecision() {
    const decisionTitle = generateRandomName('Decision');
    const decisionDescription = generateRandomName('Description');
    const decisionRationale = generateRandomName('Rationale');
    const decisionAlternatives = generateRandomName('Alternatives');
    const decisionNotes = generateRandomName('Notes');

    await this.decisionsButton.click();

    await this.addDecisionButton.click();

    await this.addDecisionTitle.waitFor({ state: 'visible' });
    await this.addDecisionTitle.fill(decisionTitle);

    await this.addDecisionDescription.fill(decisionDescription);
    await this.addDecisionRationale.fill(decisionRationale);
    await this.addDecisionAlternatives.fill(decisionAlternatives);
    await this.addDecisionNotes.fill(decisionNotes);

    await this.updateDecisionBtn.waitFor({ state: 'visible', timeout: 30000 });
    await this.loadingOverlay.waitFor({ state: 'hidden' }).catch(() => {});
    await this.updateDecisionBtn.click();

    console.log('✅ Decision has been added successfully...');
  }

  //addLesson
  async addLesson() {
    const lessonTitle = generateRandomName('Lesson');
    const lessonSummary = generateRandomName('Summary');
    const lessonLearn = generateRandomName('Learn');
    const lessonContext = generateRandomName('Context');
    const lessonWorked = generateRandomName('Worked');
    const lessonNotWorked = generateRandomName('NotWorked');
    const lessonRecommend = generateRandomName('Recommend');

    await this.lessonsButton.click();

    await this.addLessonButton.click();

    await this.addLessonTitle.waitFor({ state: 'visible' });
    await this.addLessonTitle.fill(lessonTitle);
    await this.addLessonSummary.fill(lessonSummary);
    await this.addLessonLearn.fill(lessonLearn);
    await this.addLessonContext.fill(lessonContext);
    await this.addLessonWorked.fill(lessonWorked);
    await this.addLessonNotWorked.fill(lessonNotWorked);
    await this.addLessonRecommend.fill(lessonRecommend);

    await this.updateLessonBtn.waitFor({ state: 'visible', timeout: 30000 });
    await this.loadingOverlay.waitFor({ state: 'hidden' }).catch(() => {});
    await this.updateLessonBtn.click();
    await this.page.waitForFunction(() => {
      const dialog = [...document.querySelectorAll('[role="dialog"]')].find(d => d.textContent.includes('Capture learnings'));
      return !dialog || dialog.style.pointerEvents !== 'auto';
    });

    console.log('✅ Lesson has been added successfully...');
  }

  //addComment
  async addComment() {
    const comment = generateRandomName('Comment');

    await this.commentsTab.click();

    await this.internalTeamButton.click();
    await this.portalButton.click();

    await this.commentBox.click();
    await this.commentBox.fill(comment);

    await this.submitCommentButton.click();

    console.log('✅ Comment has been submitted successfully...');
  }

  //viewActivities
  async viewActivities() {
    await this.activitiesTab.click();
    console.log('✅ Activities tab has been opened successfully...');
    console.log('❌ Issues Detected - 404 Page Not Found...');
  }

  //completeProjectFlow
  async completeProjectFlow() {
    await this.addTag();
    await this.toggleTeam();
    await this.fillDetailsSection();
    await this.addTask();
    await this.publishCanvas();
    await this.addProblem();
    await this.addAssumption();
    await this.addExperiment();
    await this.addRisk();
    await this.addDecision();
    await this.addLesson();
    await this.addComment();
    await this.viewActivities();
  }
}
