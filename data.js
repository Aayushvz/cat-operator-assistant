// All numbers come from the two problem-statement datasets.
// Anything marked "assumed" is a plausible sensor value the brief lets us assume.
window.DATA = (() => {
  const telemetry = [
    { ts: '2025-05-01 08:00', label: '01 May 08:00', engine: 1523.5, fuel: 5.2, cycles: 12, idle: 30, belt: 'Fastened', alert: false },
    { ts: '2025-05-01 10:00', label: '01 May 10:00', engine: 1524.8, fuel: 3.8, cycles: 2, idle: 55, belt: 'Unfastened', alert: true },
    { ts: '2025-05-01 14:00', label: '01 May 14:00', engine: 1526.5, fuel: 6.1, cycles: 10, idle: 15, belt: 'Fastened', alert: false },
    { ts: '2025-05-02 09:00', label: '02 May 09:00', engine: 1530.2, fuel: 2.0, cycles: 1, idle: 60, belt: 'Unfastened', alert: true },
  ];

  const tasks = [
    { id: 'T001', type: 'Earth Excavation', weather: 'Sunny', skill: 'Expert', age: 2, est: 60, actual: 58 },
    { id: 'T002', type: 'Trenching', weather: 'Rainy', skill: 'Intermediate', age: 4, est: 45, actual: 52 },
    { id: 'T003', type: 'Material Loading', weather: 'Cloudy', skill: 'Beginner', age: 3, est: 30, actual: 42 },
    { id: 'T004', type: 'Grading', weather: 'Sunny', skill: 'Expert', age: 5, est: 35, actual: 33 },
    { id: 'T005', type: 'Demolition', weather: 'Windy', skill: 'Intermediate', age: 6, est: 90, actual: 105 },
  ];

  // Multiplier model, hand-tuned on the five tasks above.
  const factors = {
    skill: { Expert: 0.95, Intermediate: 1.08, Beginner: 1.35 },
    weather: { Sunny: 1.0, Cloudy: 1.0, Windy: 1.07, Rainy: 1.08 },
    age: (yrs) => (yrs >= 5 ? 1.03 : 1.0),
  };
  const predict = (planned, skill, weather, age) =>
    planned * factors.skill[skill] * factors.weather[weather] * factors.age(age);

  const mape = (pairs) => pairs.reduce((s, [p, a]) => s + Math.abs(p - a) / a, 0) / pairs.length;
  const plannerError = mape(tasks.map((t) => [t.est, t.actual]));
  const modelError = mape(tasks.map((t) => [predict(t.est, t.skill, t.weather, t.age), t.actual]));

  // Shift replay for 01 May, minutes since 08:00. Built to agree with the telemetry:
  // 30 min idle before 08:00 snapshot window, 55 min idle with belt off around 10:00, 15 min idle before 14:00.
  const LIVE = 411; // 14:51, T002 in progress
  const segments = [
    { from: 0, to: 58, kind: 'work', task: 'T001 Earth Excavation' },
    { from: 58, to: 70, kind: 'idle' },
    { from: 70, to: 103, kind: 'work', task: 'T004 Grading' },
    { from: 103, to: 158, kind: 'idle', beltOff: [110, 158] },
    // restarted after the long idle without buckling up: the 10:38 alert on the replay
    { from: 158, to: 240, kind: 'work', task: 'Site prep, Zone B', beltOff: [158, 162] },
    { from: 240, to: 300, kind: 'break' },
    { from: 300, to: 365, kind: 'work', task: 'Site prep, Zone B' },
    { from: 365, to: 380, kind: 'idle' },
    { from: 380, to: 600, kind: 'work', task: 'T002 Trenching' },
  ];
  const alertsOnTrack = [
    { t: 120, text: 'Seatbelt unfastened, 10:00' },
    { t: 158, text: 'Idle 55 min, restart without belt check' },
  ];

  const alerts = [
    { tone: 'crit', icon: 'armchair', title: 'Seatbelt unfastened while operating', time: '02 May 09:00' },
    { tone: 'caution', icon: 'hourglass', title: 'Excessive idling: 60 min, 1 load cycle', time: '02 May 09:00' },
    { tone: 'warn', icon: 'gauge', title: '3.7 engine hr logged for 1 load cycle', time: '01 May 14:00 to 02 May 09:00' },
    { tone: 'crit', icon: 'armchair', title: 'Seatbelt unfastened + 55 min idle', time: '01 May 10:00' },
  ];

  const health = [
    { icon: 'cog', name: 'Engine', st: 'ok', label: 'Healthy' },
    { icon: 'droplets', name: 'Hydraulics', st: 'ok', label: 'Healthy' },
    { icon: 'tractor', name: 'Undercarriage', st: 'warn', label: 'Warning' },
    { icon: 'shovel', name: 'Bucket teeth', st: 'ok', label: 'Healthy' },
    { icon: 'thermometer', name: 'Cooling', st: 'ok', label: 'Healthy' },
  ];

  // Ghost delta: each task on the replay compared with the operator's personal best on a similar task.
  // total = this run's actual (done) or predicted (running) minutes; pb = personal best (sample values).
  const ghosts = [
    { id: 'T001', name: 'Earth Excavation', start: 0, total: 58, pb: 56, pbWhen: '28 Apr, sunny' },
    { id: 'T004', name: 'Grading', start: 70, total: 33, pb: 34, pbWhen: '21 Apr, sunny' },
    { id: 'T002', name: 'Trenching', start: 380, total: 52, pb: 47, pbWhen: '12 Apr, light rain' },
  ];

  const operator = {
    name: 'Aayush Raj', id: 'OP1001', role: 'Excavator Operator',
    site: 'Zone B', shift: 'Shift A · 08:00 to 18:00', languages: 'English, हिंदी',
  };

  // Real videos from the official Cat® Products YouTube channel (verified with YouTube oEmbed).
  const videos = [
    { id: 'tgqk0jftKXc', title: 'Cat® 374F Large Excavator at Work | Truck Loading', topic: 'Material loading',
      why: 'T003 Material Loading ran 40% over plan (42 min vs 30), your biggest overrun this week.' },
    { id: 'CJM_qHYXJDA', title: 'Safety Tips for Your Cat® Excavator', topic: 'Safety',
      why: '2 of 4 telemetry snapshots show the seatbelt unfastened after long idles.' },
    { id: 's22FKB2Zrnk', title: 'Operator Coaching on Cat® Next Gen Excavators', topic: 'Efficiency',
      why: 'Fuel per load cycle reached 2.0 L, 4x the 0.5 L target, during long idles.' },
    { id: 'hRLb8oAKX30', title: 'How to Operate Your Cat® Medium Excavator', topic: 'Operating basics' },
    { id: 'KwvguKaFliU', title: 'Cat® Next Generation Excavators: Starting Machine with Secure Start and Operator ID', topic: 'Machine start' },
    { id: 'n24LwkpgBSM', title: 'Cat® Next Generation Excavator Operator Training: Grade Assist Boom', topic: 'Grading' },
    { id: 'uPlt7seVi9o', title: 'Cat® Next Generation Excavator Operator Training: Grade with 3D', topic: 'Grading' },
  ];

  return { ghosts, operator, videos, telemetry, tasks, factors, predict, plannerError, modelError, LIVE, segments, alertsOnTrack, alerts, health };
})();
