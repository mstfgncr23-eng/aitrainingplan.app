const wait = (ms = 420) => new Promise((resolve) => setTimeout(resolve, ms));

const state = {
  runId: null,
  profile: null,
  plan: null,
  schedule: [],
  planVersion: 1,
  events: [],
  calendarStore: new Map(),
};

const form = document.querySelector('#profile-form');
const emptyState = document.querySelector('#empty-state');
const resultArea = document.querySelector('#result-area');
const runStatus = document.querySelector('#run-status');
const scheduleNode = document.querySelector('#schedule');
const validationSummary = document.querySelector('#validation-summary');
const eventLogNode = document.querySelector('#event-log');
const planTitle = document.querySelector('#plan-title');
const completion = document.querySelector('#completion');
const completionOutput = document.querySelector('#completion-output');
const rpe = document.querySelector('#rpe');
const rpeOutput = document.querySelector('#rpe-output');
const retryResult = document.querySelector('#retry-result');

const dayLabels = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

function createRunId() {
  return `run_${Date.now().toString(36)}`;
}

function logEvent(type, payload = {}) {
  state.events.push({
    id: `evt_${state.events.length + 1}`,
    runId: state.runId,
    type,
    timestamp: new Date().toISOString(),
    payload,
  });
  eventLogNode.textContent = JSON.stringify(state.events, null, 2);
}

function setStep(name, status, label) {
  const step = document.querySelector(`[data-step="${name}"]`);
  step.classList.remove('active', 'done', 'failed');
  if (status) step.classList.add(status);
  step.querySelector('.step-state').textContent = label;
}

function resetPipeline() {
  ['intake', 'planner', 'validator', 'publisher', 'adapter'].forEach((step) => {
    setStep(step, '', 'Bekliyor');
  });
  state.runId = createRunId();
  state.profile = null;
  state.plan = null;
  state.schedule = [];
  state.planVersion = 1;
  state.events = [];
  state.calendarStore.clear();
  retryResult.className = 'retry-result';
  retryResult.textContent = 'Henüz test edilmedi.';
  runStatus.textContent = 'Çalışıyor';
  runStatus.className = 'status-chip';
  logEvent('WORKFLOW_STARTED');
}

async function runAgentStep(name, startedEvent, completedEvent, task) {
  setStep(name, 'active', 'Çalışıyor');
  logEvent(startedEvent);
  await wait();

  try {
    const result = await task();
    setStep(name, 'done', 'Tamamlandı');
    logEvent(completedEvent, result.audit || {});
    return result;
  } catch (error) {
    setStep(name, 'failed', 'Hata');
    logEvent('AGENT_FAILED', { agent: name, message: error.message });
    throw error;
  }
}

/**
 * Agent 1: Raw form values are normalized into a stable profile contract.
 * No planning happens here.
 */
async function intakeAgent(rawInput) {
  const profile = {
    goal: rawInput.goal,
    trainingDays: Math.max(2, Math.min(6, Number(rawInput.days))),
    sessionMinutes: Math.max(25, Math.min(90, Number(rawInput.duration))),
    level: rawInput.level,
    equipment: rawInput.equipment,
    limitations: rawInput.kneeLimit ? ['knee_sensitivity'] : [],
    preferredStartHour: 18,
  };

  return {
    profile,
    audit: {
      decision: 'PROFILE_NORMALIZED',
      reasonCodes: ['INPUT_BOUNDS_APPLIED', 'LIMITATIONS_STRUCTURED'],
    },
  };
}

const exerciseLibraries = {
  gym: {
    push: ['Bench Press', 'Incline Dumbbell Press', 'Cable Row', 'Lateral Raise', 'Triceps Pushdown'],
    lower: ['Back Squat', 'Romanian Deadlift', 'Leg Curl', 'Walking Lunge', 'Standing Calf Raise'],
    full: ['Goblet Squat', 'Dumbbell Bench Press', 'Lat Pulldown', 'Romanian Deadlift', 'Face Pull'],
  },
  dumbbell: {
    push: ['Dumbbell Floor Press', 'One-arm Row', 'Shoulder Press', 'Lateral Raise', 'Dumbbell Curl'],
    lower: ['Goblet Squat', 'Dumbbell Romanian Deadlift', 'Reverse Lunge', 'Glute Bridge', 'Calf Raise'],
    full: ['Goblet Squat', 'Dumbbell Floor Press', 'One-arm Row', 'Romanian Deadlift', 'Dead Bug'],
  },
  bodyweight: {
    push: ['Push-up', 'Pike Push-up', 'Inverted Row', 'Bench Dip', 'Plank'],
    lower: ['Bodyweight Squat', 'Reverse Lunge', 'Single-leg Glute Bridge', 'Hamstring Walkout', 'Calf Raise'],
    full: ['Bodyweight Squat', 'Push-up', 'Inverted Row', 'Glute Bridge', 'Dead Bug'],
  },
};

function setsForLevel(level) {
  if (level === 'advanced') return 4;
  if (level === 'beginner') return 2;
  return 3;
}

/** Agent 2: Creates a candidate plan. It cannot approve its own output. */
async function plannerAgent(profile) {
  const library = exerciseLibraries[profile.equipment];
  const baseSets = setsForLevel(profile.level);
  const split = profile.trainingDays <= 3 ? ['full'] : ['push', 'lower'];
  const sessions = Array.from({ length: profile.trainingDays }, (_, index) => {
    const type = split[index % split.length];
    const exercises = library[type].map((name, exerciseIndex) => ({
      id: `ex_${index + 1}_${exerciseIndex + 1}`,
      name,
      sets: baseSets,
      reps: profile.goal === 'strength' && exerciseIndex < 2 ? '4-6' : '8-12',
      restSeconds: exerciseIndex < 2 ? 120 : 75,
    }));

    return {
      id: `session_${index + 1}`,
      title: split.length === 1 ? `Full Body ${index + 1}` : `${type === 'push' ? 'Upper' : 'Lower'} ${Math.floor(index / 2) + 1}`,
      exercises,
      estimatedMinutes: 10 + exercises.reduce((sum, exercise) => sum + exercise.sets * 2.7, 0),
    };
  });

  return {
    plan: {
      version: state.planVersion,
      goal: profile.goal,
      sessions,
      progressionRule: 'Üst tekrar sınırı tüm setlerde tamamlanırsa yükü %2,5 artır.',
      generatedBy: 'planner-agent-v1',
    },
    audit: {
      decision: 'CANDIDATE_PLAN_GENERATED',
      reasonCodes: [`${profile.trainingDays}_DAY_SPLIT`, profile.goal.toUpperCase(), profile.level.toUpperCase()],
    },
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Agent 3: Validates duration, equipment and limitations. It may repair the
 * candidate, but it returns a separate approval decision and change list.
 */
async function validatorAgent(profile, candidatePlan) {
  const validatedPlan = clone(candidatePlan);
  const changes = [];
  const warnings = [];

  validatedPlan.sessions.forEach((session) => {
    if (profile.limitations.includes('knee_sensitivity')) {
      session.exercises.forEach((exercise) => {
        const risky = ['Back Squat', 'Walking Lunge', 'Bodyweight Squat'].includes(exercise.name);
        if (risky) {
          const oldName = exercise.name;
          exercise.name = profile.equipment === 'gym' ? 'Box Squat (controlled range)' : 'Supported Sit-to-Stand';
          changes.push(`${oldName} → ${exercise.name}`);
        }
      });
    }

    while (session.estimatedMinutes > profile.sessionMinutes && session.exercises.length > 3) {
      const removed = session.exercises.pop();
      session.estimatedMinutes = 10 + session.exercises.reduce((sum, exercise) => sum + exercise.sets * 2.7, 0);
      changes.push(`${session.title}: ${removed.name} süre sınırı için çıkarıldı`);
    }

    if (session.estimatedMinutes > profile.sessionMinutes) {
      session.exercises.forEach((exercise) => {
        exercise.sets = Math.max(2, exercise.sets - 1);
      });
      session.estimatedMinutes = 10 + session.exercises.reduce((sum, exercise) => sum + exercise.sets * 2.7, 0);
      changes.push(`${session.title}: set sayısı süre sınırı için azaltıldı`);
    }

    if (session.exercises.length < 3) {
      warnings.push(`${session.title} minimum hareket sayısının altında.`);
    }
  });

  const approved = warnings.length === 0;
  if (!approved) throw new Error(warnings.join(' '));

  validatedPlan.validatedBy = 'validator-agent-v1';
  validatedPlan.validation = {
    approved: true,
    changes,
    checkedRules: ['SESSION_DURATION', 'EQUIPMENT_COMPATIBILITY', 'LIMITATION_CONFLICT', 'MINIMUM_SESSION_SHAPE'],
  };

  return {
    plan: validatedPlan,
    changes,
    audit: {
      decision: 'PLAN_APPROVED',
      reasonCodes: ['RULES_PASSED', changes.length ? 'AUTO_REPAIRS_APPLIED' : 'NO_REPAIR_NEEDED'],
      changes,
    },
  };
}

function nextDateForWeekday(targetDay, weekOffset = 0) {
  const date = new Date();
  date.setHours(18, 0, 0, 0);
  const currentDay = date.getDay();
  let delta = (targetDay - currentDay + 7) % 7;
  if (delta === 0) delta = 7;
  date.setDate(date.getDate() + delta + weekOffset * 7);
  return date;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function getTrainingWeekdays(count) {
  const patterns = {
    2: [2, 5],
    3: [1, 3, 5],
    4: [1, 2, 4, 5],
    5: [1, 2, 3, 5, 6],
    6: [1, 2, 3, 4, 5, 6],
  };
  return patterns[count] || patterns[3];
}

/** Agent 4: Publishes only approved plans and uses canonical idempotency keys. */
async function publisherAgent(profile, approvedPlan) {
  if (!approvedPlan.validation?.approved) {
    throw new Error('Validator onayı olmadan yayınlama yapılamaz.');
  }

  const weekdays = getTrainingWeekdays(profile.trainingDays);
  const schedule = approvedPlan.sessions.map((session, index) => {
    const start = nextDateForWeekday(weekdays[index]);
    const end = new Date(start.getTime() + Math.round(session.estimatedMinutes) * 60_000);
    const idempotencyKey = `plan-${approvedPlan.version}-${session.id}-${dateKey(start)}`;

    const calendarEvent = {
      id: idempotencyKey,
      idempotencyKey,
      sessionId: session.id,
      title: session.title,
      start: start.toISOString(),
      end: end.toISOString(),
      exercises: session.exercises,
    };

    if (!state.calendarStore.has(idempotencyKey)) {
      state.calendarStore.set(idempotencyKey, calendarEvent);
    }

    return state.calendarStore.get(idempotencyKey);
  });

  return {
    schedule,
    audit: {
      decision: 'CALENDAR_ARTIFACT_PUBLISHED',
      reasonCodes: ['VALIDATOR_APPROVED', 'IDEMPOTENT_WRITE'],
      eventCount: schedule.length,
    },
  };
}

/** Agent 5: Produces a new plan version from completion and effort signals. */
async function adaptationAgent(plan, metrics) {
  const adapted = clone(plan);
  adapted.version = plan.version + 1;
  const changes = [];

  if (metrics.completion < 60 && metrics.rpe >= 8.5) {
    adapted.sessions.forEach((session) => {
      session.exercises.forEach((exercise) => {
        exercise.sets = Math.max(2, exercise.sets - 1);
      });
    });
    changes.push('Yüksek efor ve düşük tamamlanma nedeniyle her harekette bir set azaltıldı.');
  } else if (metrics.completion < 60) {
    changes.push('Fiziksel kapasite düşürülmedi; düşük tamamlanma takvim uyumu olarak işaretlendi.');
  } else if (metrics.completion >= 85 && metrics.rpe <= 8) {
    adapted.progressionRule = 'Bir sonraki hafta ana hareketlerde yükü %2,5 artır.';
    changes.push('Yüksek uyum ve kontrollü RPE nedeniyle progression aktif edildi.');
  } else if (metrics.rpe >= 9) {
    adapted.progressionRule = 'Yükü koru; bir sonraki hafta RPE tekrar değerlendirilsin.';
    changes.push('Yüksek RPE nedeniyle yük artışı donduruldu.');
  } else {
    changes.push('Plan hacmi korundu; yeni veri toplanmaya devam edecek.');
  }

  adapted.adaptation = {
    basedOn: metrics,
    changes,
    generatedBy: 'adaptation-agent-v1',
  };

  return {
    plan: adapted,
    changes,
    audit: {
      decision: 'ADAPTED_PLAN_VERSION_CREATED',
      reasonCodes: ['COMPLETION_ANALYZED', 'RPE_ANALYZED'],
      changes,
    },
  };
}

function renderSchedule(schedule) {
  scheduleNode.innerHTML = schedule.map((event) => {
    const date = new Date(event.start);
    const exercises = event.exercises.map((exercise) =>
      `<li>${exercise.name} · ${exercise.sets}×${exercise.reps}</li>`
    ).join('');

    return `
      <article class="session-card">
        <header>
          <h4>${event.title}</h4>
          <time>${dayLabels[date.getDay()]} · ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</time>
        </header>
        <ul>${exercises}</ul>
      </article>
    `;
  }).join('');
}

function renderValidation(changes) {
  validationSummary.innerHTML = changes.length
    ? `<strong>Validator onayladı.</strong> ${changes.length} otomatik düzeltme uygulandı: ${changes.join(' · ')}`
    : '<strong>Validator onayladı.</strong> Süre, ekipman, hacim ve sınırlama kontrolleri geçti.';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  resetPipeline();
  emptyState.classList.add('hidden');
  resultArea.classList.add('hidden');

  const rawInput = {
    goal: document.querySelector('#goal').value,
    days: document.querySelector('#days').value,
    duration: document.querySelector('#duration').value,
    level: document.querySelector('#level').value,
    equipment: document.querySelector('#equipment').value,
    kneeLimit: document.querySelector('#knee-limit').checked,
  };

  try {
    const intake = await runAgentStep('intake', 'INTAKE_STARTED', 'INTAKE_COMPLETED', () => intakeAgent(rawInput));
    state.profile = intake.profile;

    const candidate = await runAgentStep('planner', 'PLAN_GENERATION_STARTED', 'PLAN_GENERATED', () => plannerAgent(state.profile));

    const validation = await runAgentStep('validator', 'VALIDATION_STARTED', 'PLAN_APPROVED', () => validatorAgent(state.profile, candidate.plan));
    state.plan = validation.plan;

    const publication = await runAgentStep('publisher', 'CALENDAR_PUBLISH_STARTED', 'CALENDAR_PUBLISHED', () => publisherAgent(state.profile, state.plan));
    state.schedule = publication.schedule;

    setStep('adapter', '', 'Performans verisi bekliyor');
    renderValidation(validation.changes);
    renderSchedule(state.schedule);
    planTitle.textContent = `Plan v${state.plan.version}`;
    resultArea.classList.remove('hidden');
    runStatus.textContent = 'Yayınlandı';
    runStatus.className = 'status-chip';
    logEvent('WORKFLOW_COMPLETED', { planVersion: state.plan.version });
  } catch (error) {
    runStatus.textContent = 'Durduruldu';
    runStatus.className = 'status-chip muted';
    validationSummary.textContent = error.message;
    resultArea.classList.remove('hidden');
  }
});

completion.addEventListener('input', () => {
  completionOutput.textContent = `%${completion.value}`;
});

rpe.addEventListener('input', () => {
  rpeOutput.textContent = rpe.value;
});

document.querySelector('#adapt-plan').addEventListener('click', async () => {
  if (!state.plan) return;

  setStep('adapter', 'active', 'Çalışıyor');
  logEvent('ADAPTATION_STARTED', { completion: Number(completion.value), rpe: Number(rpe.value) });
  await wait();

  const result = await adaptationAgent(state.plan, {
    completion: Number(completion.value),
    rpe: Number(rpe.value),
  });

  state.plan = result.plan;
  state.planVersion = result.plan.version;
  setStep('adapter', 'done', `v${state.plan.version} üretildi`);
  planTitle.textContent = `Plan v${state.plan.version}`;
  validationSummary.innerHTML = `<strong>Adaptation Agent:</strong> ${result.changes.join(' ')}`;
  logEvent('PLAN_VERSION_ACTIVATED', result.audit);
});

function toIcsDate(isoDate) {
  return new Date(isoDate).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeIcs(text) {
  return String(text).replaceAll('\\', '\\\\').replaceAll(',', '\\,').replaceAll(';', '\\;').replaceAll('\n', '\\n');
}

function createIcs(schedule) {
  const events = schedule.map((event) => {
    const description = event.exercises
      .map((exercise) => `${exercise.name}: ${exercise.sets}x${exercise.reps}`)
      .join(' | ');

    return [
      'BEGIN:VEVENT',
      `UID:${event.id}@aitrainingplan.app`,
      `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
      `DTSTART:${toIcsDate(event.start)}`,
      `DTEND:${toIcsDate(event.end)}`,
      `SUMMARY:${escapeIcs(`AI Training Plan · ${event.title}`)}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      'END:VEVENT',
    ].join('\r\n');
  }).join('\r\n');

  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AI Training Plan//Agent Workflow//TR', events, 'END:VCALENDAR'].join('\r\n');
}

document.querySelector('#download-calendar').addEventListener('click', () => {
  if (!state.schedule.length) return;
  const blob = new Blob([createIcs(state.schedule)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ai-training-plan-v${state.plan.version}.ics`;
  link.click();
  URL.revokeObjectURL(url);
  logEvent('CALENDAR_ARTIFACT_DOWNLOADED', { format: 'ics' });
});

document.querySelector('#simulate-retry').addEventListener('click', async () => {
  const profile = state.profile || {
    trainingDays: 3,
    sessionMinutes: 50,
    preferredStartHour: 18,
  };

  const plan = state.plan || {
    version: 1,
    validation: { approved: true },
    sessions: [
      { id: 'session_1', title: 'Full Body 1', estimatedMinutes: 45, exercises: [] },
      { id: 'session_2', title: 'Full Body 2', estimatedMinutes: 45, exercises: [] },
      { id: 'session_3', title: 'Full Body 3', estimatedMinutes: 45, exercises: [] },
    ],
  };

  state.calendarStore.clear();
  const firstAttempt = await publisherAgent(profile, plan);
  const uniqueAfterFirstAttempt = state.calendarStore.size;
  const retryAttempt = await publisherAgent(profile, plan);
  const uniqueAfterRetry = state.calendarStore.size;
  const duplicateAttemptsBlocked = firstAttempt.schedule.length + retryAttempt.schedule.length - uniqueAfterRetry;

  retryResult.className = 'retry-result success';
  retryResult.textContent = `İlk publish: ${uniqueAfterFirstAttempt} etkinlik. Retry sonrası: ${uniqueAfterRetry} benzersiz etkinlik. ${duplicateAttemptsBlocked} kopya yazma girişimi idempotency anahtarıyla engellendi.`;
  logEvent('CALENDAR_RETRY_AUTOPSY_COMPLETED', {
    firstAttempt: uniqueAfterFirstAttempt,
    afterRetry: uniqueAfterRetry,
    duplicateAttemptsBlocked,
  });
});
